import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Answer, Pending } from '../types'
import {
  ANSWER_SYSTEM,
  BUILD_SYSTEM,
  DEFAULT_MAX_QUESTIONS,
  DEFAULT_MIN_WORDS,
  EXTRACT_SYSTEM,
  FIND_SYSTEM,
  MAX_DUMP_CHARS,
  MODEL,
  MODEL_MAX_TOKENS,
  MODEL_TIMEOUT_MS,
  READING,
} from './data'
import {
  applyUpdate,
  buildPrompt,
  countWords,
  decideSubmit,
  isExpired,
  parseArgs,
  parseJson,
  shouldOffer,
  structurePrefix,
  triage,
} from './logic'
import { toFindings, toPoints, toSections, toUpdate } from './shape'
import { busyBand, offerBand, readyBand } from './view'

const busy = atom({ plugin: 'brain-dump', key: 'busy' } as const, null)
const ready = atom({ plugin: 'brain-dump', key: 'ready' } as const, null)

/** State of one mod instance, created per `register` call. */
type Run = {
  isInteractive: boolean
  isEnabled: boolean
  isFlowActive: boolean
  isIgnored: boolean
  isExpanded: boolean
  isOffering: boolean
  /** The last non-empty draft the banner saw: a slash command cannot read the box. */
  lastDraft: string
  minWords: number
  maxQuestions: number
}

const number = (value: unknown, fallback: number) =>
  typeof value === 'number' ? value : fallback

// The store is shared by every session, so a pending dump is kept per session.
const pendingKey = async ($: Engine) => `pending:${await $.session.id()}`

const loadPending = async ($: Engine) =>
  (await $.store.get(await pendingKey($))) as Pending | null | undefined

const savePending = async ($: Engine, p: Pending) => {
  await $.store.set(await pendingKey($), p)
}

const clearPending = async ($: Engine) => {
  await $.store.delete(await pendingKey($))
  await update($, ready, () => null)
  $.ui.invalidate('ui.render')
}

// A dropped prompt is put back in the box after the hook returns, so a fill
// made inside the hook would be written over. Fill on the next tick.
const later = ($: Engine, fn: () => Promise<void>) => {
  $.clock.after(0, () => {
    void fn()
  })
}

/** One model call that must return JSON: one retry on bad JSON, else it throws. */
async function ask($: Engine, system: string, prompt: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await $.model.complete({
      model: MODEL,
      system,
      prompt,
      maxTokens: MODEL_MAX_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
    if (!r.isAnswered) throw new Error('the model did not answer')
    const json = parseJson(r.text)
    if (json !== null) return json
  }
  throw new Error('the model did not return JSON')
}

const field = (v: unknown, name: string) =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[name] : undefined

async function runFlow($: Engine, run: Run, dump: string) {
  const text = dump.trim()
  if (text === '') {
    $.ui.toast('Nothing to structure.')
    return
  }
  // Whatever stops the flow, the dump goes back in the box: it is never lost.
  const bail = async (message: string) => {
    $.ui.toast(message)
    await $.prompt.fill({ text })
  }
  if (text.length > MAX_DUMP_CHARS) {
    await bail('That dump is too long to structure; it is back in the prompt box.')
    return
  }
  if (run.isFlowActive) {
    await bail('A brain dump is already in progress; your text is back in the prompt box.')
    return
  }
  run.isFlowActive = true
  try {
    const earlier = await loadPending($)
    if (earlier && !isExpired(earlier, await $.clock.now())) {
      const choice = await $.ui
        .ask('Replace the earlier dump?', ['Replace it (recommended)', 'Keep it'])
        .catch(() => 'Keep it')
      if (!choice.startsWith('Replace')) {
        await $.prompt.fill({ text })
        return
      }
    }
    await runStages($, run, text)
  } finally {
    run.isFlowActive = false
    await update($, busy, () => null)
    $.ui.invalidate('ui.render')
  }
}

async function runStages($: Engine, run: Run, dump: string) {
  let pending: Pending = {
    dump,
    points: [],
    findings: [],
    answers: [],
    prompt: '',
    stage: 'reading',
    at: await $.clock.now(),
  }
  const show = async (message: string) => {
    await update($, busy, () => message)
    $.ui.invalidate('ui.render')
  }
  await savePending($, pending)
  run.lastDraft = ''
  await $.prompt.fill({ text: '' })
  await show(READING)

  try {
    const points = toPoints(field(await ask($, EXTRACT_SYSTEM, dump), 'points'))
    if (points.length === 0) throw new Error('no points found')
    const findings = toFindings(
      field(await ask($, FIND_SYSTEM, JSON.stringify({ points })), 'findings'),
    )
    let state = { points, findings }
    const answers: Answer[] = []
    const seen = new Set<string>()

    pending = { ...pending, points, findings, stage: 'asking' }
    await savePending($, pending)

    // One question at a time, until nothing worth asking is left, the cap is
    // reached, or the owner says enough (a dismissed question counts as enough).
    while (answers.length < run.maxQuestions) {
      const queue = triage(
        state.findings.filter(f => !seen.has(f.id)),
        run.maxQuestions - answers.length,
      )
      const next = queue.ask[0]
      if (!next) break
      await update($, busy, () => null)
      $.ui.invalidate('ui.render')
      const total = answers.length + queue.ask.length
      const answer = await $.ui
        .ask(`Question ${answers.length + 1} of ${total}: ${next.question}`, {
          options: next.options,
          header: next.header,
        })
        .catch(() => 'enough')
      if (answer.trim().toLowerCase() === 'enough') break
      seen.add(next.id)
      answers.push({ findingId: next.id, subject: next.subject, answer })
      await show('Checking your answer...')
      const upd = toUpdate(
        await ask(
          $,
          ANSWER_SYSTEM,
          JSON.stringify({ points: state.points, finding: next, answer }),
        ),
      )
      state = applyUpdate(state, { ...upd, resolved: [...upd.resolved, next.id] })
      pending = { ...pending, points: state.points, findings: state.findings, answers }
      await savePending($, pending)
    }

    // What was not asked: cheap items are assumptions, costly gaps and
    // ambiguities become placeholders, conflicts still open head the prompt.
    const rest = triage(
      state.findings.filter(f => !seen.has(f.id)),
      0,
    )
    const assumptions = [
      ...rest.assumed.map(f => f.assumption),
      ...rest.left
        .filter(f => f.kind !== 'conflict')
        .map(f => `[you fill this in: ${f.question}]`),
    ]
    const open = rest.left
      .filter(f => f.kind === 'conflict')
      .map(f => `${f.subject || f.question}: not settled`)
    if (answers.length === 0 && open.length === 0) {
      $.ui.toast(`No conflicts found; ${assumptions.length} assumptions listed`)
    }

    await show('Writing the structured prompt...')
    const sections = toSections(
      await ask($, BUILD_SYSTEM, JSON.stringify({ points: state.points, answers })),
    )
    const prompt = buildPrompt({ ...sections, assumptions, open })
    await savePending($, { ...pending, prompt, stage: 'ready' })
    const lines = prompt.split('\n')
    await update($, ready, () => ({ preview: lines, count: lines.length }))
  } catch {
    // The mod never loses the dump: it goes back into the box.
    await $.store.delete(await pendingKey($))
    await $.prompt.fill({ text: dump })
    $.ui.toast("Couldn't read the dump; it is back in the prompt box.")
  }
}

export const register: Register = (on, options) => {
  const run: Run = {
    isInteractive: false,
    isEnabled: true,
    isFlowActive: false,
    isIgnored: false,
    isExpanded: false,
    isOffering: false,
    lastDraft: '',
    minWords: number(options.minWords, DEFAULT_MIN_WORDS),
    maxQuestions: number(options.maxQuestions, DEFAULT_MAX_QUESTIONS),
  }

  on('session.start', async ($, e, next) => {
    run.isInteractive = e.isInteractive
    if (e.isInteractive) {
      await $.command.register({
        name: 'brain-dump',
        description: 'Turn a long draft into one structured prompt (on, off, resume)',
      })
      run.isEnabled = ((await $.store.get('enabled')) as boolean | undefined) !== false
    }
    return next(e)
  })

  on('command.run', { command: 'brain-dump' }, async ($, e) => {
    const state = () => `Brain dump auto-detect is ${run.isEnabled ? 'on' : 'off'}.`
    const args = parseArgs(e.args)
    if (args.kind === 'on' || args.kind === 'off') {
      run.isEnabled = args.kind === 'on'
      await $.store.set('enabled', run.isEnabled)
      $.ui.invalidate('ui.render')
      $.ui.toast(state())
      return { text: state() }
    }
    if (args.kind === 'resume') {
      const pending = await loadPending($)
      if (!pending || isExpired(pending, await $.clock.now())) {
        return { text: 'No saved dump to resume.' }
      }
      const r = await $.prompt.fill({ text: pending.dump })
      if (!r.isFilled) return { text: "Couldn't put the dump in the box." }
      await clearPending($)
      return { text: 'Your dump is back in the prompt box.' }
    }
    // A slash command replaces the draft, so a bare /brain-dump uses the last
    // draft the banner saw.
    const dump = args.kind === 'text' ? args.text : run.lastDraft
    if (dump.trim() === '') return { text: `${state()} Type or paste a dump, then run /brain-dump.` }
    void runFlow($, run, dump)
    return { text: 'Structuring your dump.' }
  })

  // Typing refreshes the offer only when it would change, so a long draft is
  // not redrawn on every key. The count is a split, well inside the 50 ms.
  on('prompt.edit', ($, e, next) => {
    if (run.isInteractive) {
      const after = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
      const isOffering = shouldOffer({
        words: countWords(after),
        minWords: run.minWords,
        isEnabled: run.isEnabled,
        isFlowActive: run.isFlowActive,
        isIgnored: run.isIgnored,
      })
      if (isOffering !== run.isOffering) $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !run.isInteractive) return next(e)
    const parts = $.ui.resolve(e)
    const message = await read($, busy)
    const done = await read($, ready)
    let mine = null
    if (message) {
      mine = busyBand(parts, message)
    } else if (done) {
      mine = readyBand(parts, done, run.isExpanded, () => {
        run.isExpanded = !run.isExpanded
        $.ui.invalidate('ui.render')
      })
    } else {
      const box = await $.prompt.read()
      if (box.text.trim() === '') run.isIgnored = false
      else run.lastDraft = box.text
      const words = countWords(box.text)
      run.isOffering = shouldOffer({
        words,
        minWords: run.minWords,
        isEnabled: run.isEnabled,
        isFlowActive: run.isFlowActive,
        isIgnored: run.isIgnored,
      })
      if (run.isOffering) {
        mine = offerBand(
          parts,
          words,
          () => void runFlow($, run, box.text),
          () => {
            run.isIgnored = true
            $.ui.invalidate('ui.render')
          },
        )
      }
    }
    if (!mine) return next(e)

    // Pass control on, so other mods' bands draw too.
    const rest = await next(e)
    const { Box } = parts
    return (
      <Box flexDirection="column">
        {rest}
        {mine}
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    // Only the owner's own typed prompt is read as go, cancel, edit or structure:.
    if (!run.isInteractive || e.command || e.isMeta || e.origin.kind !== 'composer') {
      return next(e)
    }
    run.lastDraft = ''
    const pending = (await loadPending($)) ?? null
    const decision = decideSubmit(pending, e.text, await $.clock.now())
    if (decision.kind === 'drop') return { drop: decision.reason }

    if (decision.kind === 'go' && pending) {
      const sent = await next({ ...e, text: pending.prompt })
      await clearPending($)
      return sent
    }
    if (decision.kind === 'cancel' && pending) {
      later($, async () => {
        const r = await $.prompt.fill({ text: pending.dump })
        if (r.isFilled) await clearPending($)
        else $.ui.toast("Couldn't put your dump back. It is saved: run /brain-dump resume.")
      })
      return { drop: 'Brain dump cancelled; your dump is back in the prompt box.' }
    }
    if (decision.kind === 'edit' && pending) {
      later($, async () => {
        const r = await $.prompt.fill({ text: pending.prompt })
        if (r.isFilled) {
          await savePending($, { ...pending, stage: 'editing' })
          await update($, ready, () => null)
          $.ui.invalidate('ui.render')
        } else {
          $.ui.toast("Couldn't put the prompt in the box. Type go to run it as it is.")
        }
      })
      return { drop: 'Edit the prompt, then press Enter to send it.' }
    }
    if (decision.kind === 'sent-edited' || decision.kind === 'expired') await clearPending($)

    const body = structurePrefix(e.text)
    if (body !== null) {
      if (body === '') return { drop: 'Nothing to structure.' }
      later($, () => runFlow($, run, body))
      return { drop: 'Structuring your dump. Questions follow.' }
    }
    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { drop: 'Brain dump failed; your prompt is back in the box.' },
  )
}
