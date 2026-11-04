import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { HandoffStep, HandoffView } from '../types'
import {
  CACHE_TTL_MIN,
  RUN_BEFORE_COLD_MIN,
  STEPS,
  STEP_LABELS,
  SUMMARY_PROMPT,
  SUMMARY_TIMEOUT_MS,
  TITLES,
} from './data'
import type { StepName } from './data'
import {
  buildDocument,
  classifyFiles,
  continuePrompt,
  fallbackNarrative,
  handoffDir,
  handoffPaths,
  tally,
  userRequests,
} from './document'
import { contextTrigger } from './trigger'
import { band } from './view'

const view = atom({ plugin: 'session-handoff', key: 'view' } as const, null)

let runId = 0
let isRunning = false

const patch = (
  $: Engine,
  id: number,
  fn: (v: HandoffView) => HandoffView,
) => update($, view, v => (v && v.id === id ? fn(v) : v))

async function runHandoff(
  $: Engine,
  trigger: HandoffView['trigger'],
) {
  if (isRunning) return
  isRunning = true
  const id = ++runId
  const steps: HandoffStep[] = STEPS.map(name => ({
    label: STEP_LABELS[name],
    status: 'pending',
  }))
  await update($, view, () => ({
    id,
    trigger,
    title: TITLES[trigger],
    steps,
    phase: 'working',
    isDismissed: false,
  }))

  const setStep = async (name: StepName, status: HandoffStep['status'], detail?: string) => {
    const index = STEPS.indexOf(name)
    await patch($, id, v => ({
      ...v,
      steps: v.steps.map((s, n) => (n === index ? { ...s, status, detail } : s)),
    }))
    $.ui.invalidate('ui.render')
  }

  let step: StepName = 'read'
  try {
    await setStep('read', 'running')
    const messages = await $.session.messages()
    if ('deny' in messages) throw new Error('the conversation cannot be read')
    if (messages.length === 0) throw new Error('the conversation is empty')
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd()
    const model = await $.session.model()
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const tokens = usage.context.tokens
    await setStep(
      'read',
      'done',
      `${messages.length} messages${tokens ? `, ${Math.round(tokens / 1000)}k tokens` : ''}`,
    )

    step = 'files'
    await setStep('files', 'running')
    const files = classifyFiles(messages)
    await setStep('files', 'done', `${files.changed.size} changed, ${files.read.size} read`)

    step = 'links'
    await setStep('links', 'running')
    const counts = tally(messages)
    await setStep(
      'links',
      'done',
      `${counts.skills.size} skills, ${counts.tools.size} tools, ${counts.links.size} links`,
    )

    step = 'write'
    await setStep('write', 'running', 'asking the model for a summary, can take a minute')
    const requests = userRequests(messages)
    const forked = await Promise.race([
      $.model.fork({ prompt: SUMMARY_PROMPT }),
      $.clock.sleep(SUMMARY_TIMEOUT_MS).then(() => null),
    ]).catch(() => null) // a failed fork is treated as no summary: the fallback is used
    const narrative =
      forked && forked.isAnswered && forked.text.trim() !== ''
        ? forked.text.trim()
        : fallbackNarrative(requests)

    const dir = handoffDir(await $.env.get('USERPROFILE'), await $.env.get('HOME'))
    const { path, promptPath } = handoffPaths(dir, now, sessionId)
    const prompt = continuePrompt(path, cwd)
    const doc = buildDocument({
      sessionId,
      cwd,
      model,
      now,
      tokens,
      window: usage.context.window,
      trigger,
      narrative,
      files,
      tally: counts,
      requests,
    })
    await setStep(
      'write',
      'done',
      forked && forked.isAnswered ? 'summary by the model' : 'summary from last requests',
    )

    step = 'save'
    await setStep('save', 'running')
    await $.fs.write(path, doc)
    await $.fs.write(promptPath, prompt)
    await patch($, id, v => ({ ...v, path, promptPath, prompt, cwd }))
    await setStep('save', 'done', path)

    step = 'check'
    await setStep('check', 'running')
    const savedDoc = await $.fs.read(path)
    const savedPrompt = await $.fs.read(promptPath)
    if (
      typeof savedDoc !== 'string' ||
      savedDoc.length !== doc.length ||
      !savedDoc.includes('## Recent user requests') ||
      typeof savedPrompt !== 'string' ||
      savedPrompt !== prompt
    ) {
      throw new Error('the saved file does not match what was written')
    }
    await setStep('check', 'done', `${savedDoc.length} characters verified`)
    await patch($, id, v => ({ ...v, phase: 'ready' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const index = STEPS.indexOf(step)
    await patch($, id, v => ({
      ...v,
      phase: 'failed',
      steps: v.steps.map((s, n) =>
        n === index ? { ...s, status: 'error', detail: message } : s,
      ),
    }))
  } finally {
    isRunning = false
  }
}

export const register: Register = on => {
  let cacheTimer: { cancel: () => void } | null = null
  let isContextArmed = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff-session',
      description: 'Write a handoff file so a new chat can continue this session',
    })
    return next(e)
  })

  on('command.run', { command: 'handoff-session' }, async $ => {
    if (isRunning) return { text: 'A handoff is already being written.' }
    void runHandoff($, 'command')
    return { text: 'Writing the handoff. Progress is shown above the prompt.' }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      cacheTimer?.cancel()
      cacheTimer = null
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    // Trigger 2: the cache goes cold `RUN_BEFORE_COLD_MIN` minutes from now.
    cacheTimer?.cancel()
    const wait = Math.max(1, CACHE_TTL_MIN - RUN_BEFORE_COLD_MIN) * 60000
    cacheTimer = $.clock.after(wait, () => {
      cacheTimer = null
      void (async () => {
        if (isRunning) return
        const current = await read($, view)
        if (current && !current.isDismissed) return
        await runHandoff($, 'cache')
      })()
    })

    // Trigger 3: the context passes the threshold (re-armed once it falls).
    const { context } = await $.session.usage()
    const trigger = contextTrigger(isContextArmed, context.tokens ?? 0)
    isContextArmed = trigger.isArmed
    if (trigger.isFired) void runHandoff($, 'context')
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current === null || current.isDismissed) {
      return next(e)
    }
    const parts = $.ui.resolve(e)
    const rest = await next(e)
    const dismiss = async () => {
      await update($, view, v => (v ? { ...v, isDismissed: true } : v))
    }
    const mine = band($, parts, current, e.surface, dismiss)

    // Pass control on, so other mods' bands draw too.
    const { Box } = parts
    return <Box flexDirection="column">{rest}{mine}</Box>
  })
}
