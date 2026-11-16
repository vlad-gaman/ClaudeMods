import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { HandoffStep, HandoffView } from '../types'
import {
  CACHE_TTL_MIN,
  cacheWaitMs,
  CONTEXT_THRESHOLD,
  RUN_BEFORE_COLD_MIN,
  SUMMARY_PROMPT,
  SUMMARY_TIMEOUT_MS,
  TITLES,
} from './data'
import type { StepName } from './data'
import {
  buildDocument,
  classifyFiles,
  fallbackNarrative,
  handoffDir,
  tally,
  userRequests,
} from './document'
import { savePlan } from './save'
import { failedPatch, stepList, withStep } from './steps'
import { raceSummary, summaryDetail, summaryText } from './summary'
import { contextTrigger } from './trigger'
import { verifySaved } from './verify'
import { band } from './view'

const view = atom({ plugin: 'session-handoff', key: 'view' } as const, null)

/** State of one mod instance, created per `register` call. */
type Run = {
  id: number
  isRunning: boolean
  cacheTimer: { cancel: () => void } | null
  isContextArmed: boolean
}

// The panel outlives a restart: a finished or dismissed handoff is kept in the
// plugin's store, and put back on `session.start`.
const persist = async ($: Engine) => {
  await $.store.set('view', await read($, view))
}

const restore = async ($: Engine) => {
  if (await read($, view)) return
  const saved = (await $.store.get('view')) as HandoffView | null | undefined
  // A handoff still working when the app closed will never finish.
  if (!saved || saved.phase === 'working' || saved.isDismissed) return
  await update($, view, () => saved)
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
  await update($, view, () => ({
    id,
    trigger,
    title: TITLES[trigger],
    steps: stepList(),
    phase: 'working',
    isDismissed: false,
  }))

  const setStep = async (name: StepName, status: HandoffStep['status'], detail?: string) => {
    await patch($, id, v => ({ ...v, steps: withStep(v.steps, name, status, detail) }))
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
    // a failed fork is treated as no summary: the fallback is used
    const forked = await raceSummary(
      $.model.fork({ prompt: SUMMARY_PROMPT }),
      $.clock.sleep(SUMMARY_TIMEOUT_MS).then(() => null),
    )
    const narrative = summaryText(forked) ?? fallbackNarrative(requests)

    const dir = handoffDir(await $.env.get('USERPROFILE'), await $.env.get('HOME'))
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
    const plan = savePlan(dir, now, sessionId, cwd, doc)
    await setStep('write', 'done', summaryDetail(forked))

    step = 'save'
    await setStep('save', 'running')
    for (const write of plan.writes) await $.fs.write(write.path, write.text)
    await patch($, id, v => ({ ...v, ...plan.view }))
    await setStep('save', 'done', plan.path)

    step = 'check'
    await setStep('check', 'running')
    const verdict = verifySaved(
      { doc: await $.fs.read(plan.path), prompt: await $.fs.read(plan.promptPath) },
      { doc, prompt: plan.prompt },
    )
    if (!verdict.isOk) throw new Error(verdict.message)
    await setStep('check', 'done', `${verdict.characters} characters verified`)
    await patch($, id, v => ({ ...v, phase: 'ready' }))
  } catch (error) {
    await patch($, id, v => ({ ...v, ...failedPatch(v.steps, step, error) }))
  } finally {
    run.isRunning = false
    await persist($)
  }
}

// The engine checks type and `min` against plugin.json and fills in defaults
// before `register` runs; this only narrows the type.
const number = (value: unknown, fallback: number) =>
  typeof value === 'number' ? value : fallback

export const register: Register = (on, options) => {
  const cacheMinutes = number(options.cache_minutes, CACHE_TTL_MIN)
  const contextTokens = number(options.context_tokens, CONTEXT_THRESHOLD)
  const leadMinutes = number(options.lead_minutes, RUN_BEFORE_COLD_MIN)
  const run: Run = { id: 0, isRunning: false, cacheTimer: null, isContextArmed: true }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff-session',
      description: 'Write a handoff file so a new chat can continue this session',
    })
    await restore($)
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
    const wait = cacheWaitMs(cacheMinutes, leadMinutes)
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
      await persist($)
    }
    const mine = band($, parts, current, e.surface, dismiss)

    // Pass control on, so other mods' bands draw too.
    const { Box } = parts
    return <Box flexDirection="column">{rest}{mine}</Box>
  })
}
