import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { HandoffStep, HandoffView } from '../types'
import {
  CACHE_TTL_MIN,
  CONTEXT_THRESHOLD,
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

/** State of one mod instance, created per `register` call. */
type Run = {
  id: number
  isRunning: boolean
  cacheTimer: { cancel: () => void } | null
  isContextArmed: boolean
}

const patch = (
  $: Engine,
  id: number,
  fn: (v: HandoffView) => HandoffView,
) => update($, view, v => (v && v.id === id ? fn(v) : v))

async function runHandoff(
  $: Engine,
  run: Run,
  trigger: HandoffView['trigger'],
) {
  if (run.isRunning) return
  run.isRunning = true
  const id = ++run.id
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
    run.isRunning = false
  }
}

// An option the user left unset or set to something unusable falls back to
// the default.
const positive = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

export const register: Register = (on, options) => {
  const cacheMinutes = positive(options.cache_minutes, CACHE_TTL_MIN)
  const contextTokens = positive(options.context_tokens, CONTEXT_THRESHOLD)
  const leadMinutes = positive(options.lead_minutes, RUN_BEFORE_COLD_MIN)
  const run: Run = { id: 0, isRunning: false, cacheTimer: null, isContextArmed: true }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff-session',
      description: 'Write a handoff file so a new chat can continue this session',
    })
    return next(e)
  })

  on('command.run', { command: 'handoff-session' }, async $ => {
    if (run.isRunning) return { text: 'A handoff is already being written.' }
    void runHandoff($, run, 'command')
    return { text: 'Writing the handoff. Progress is shown above the prompt.' }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      run.cacheTimer?.cancel()
      run.cacheTimer = null
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    // Trigger 2: the cache goes cold `lead_minutes` minutes from now.
    run.cacheTimer?.cancel()
    const wait = Math.max(1, cacheMinutes - leadMinutes) * 60000
    run.cacheTimer = $.clock.after(wait, () => {
      run.cacheTimer = null
      void (async () => {
        if (run.isRunning) return
        const current = await read($, view)
        if (current && !current.isDismissed) return
        await runHandoff($, run, 'cache')
      })()
    })

    // Trigger 3: the context passes the threshold (re-armed once it falls).
    const { context } = await $.session.usage()
    const trigger = contextTrigger(run.isContextArmed, context.tokens ?? 0, contextTokens)
    run.isContextArmed = trigger.isArmed
    if (trigger.isFired) void runHandoff($, run, 'context')
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
