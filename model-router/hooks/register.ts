import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SkillFrontmatter } from 'claude-code'

import type { Choice, Lock, ModelTier, SkillMode, SkillRun } from '../types'

const lock = atom({ plugin: 'model-router', key: 'lock' } as const, null)
const isOff = atom({ plugin: 'model-router', key: 'isOff' } as const, false)

const TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus']
const RANK: Record<ModelTier, number> = { haiku: 0, sonnet: 1, opus: 2 }
const SUBAGENTS: Record<string, ModelTier> = { Explore: 'haiku', 'general-purpose': 'sonnet' }

const THINK_HARD = /\b(ultrathink|think (really |very )?(hard|harder|deeply|carefully))\b/i
const HARD_START = /^(?:please\s+|can you\s+|could you\s+|help me\s+|let'?s\s+|i (?:want|need|'d like) to\s+)?(design|architect|brainstorm|plan|diagnose|debug|investigate|refactor|migrate|review|audit)(?:\s|$)/i
const HARD_ANY = /\b(root cause|race condition|deadlock|memory leak|vulnerabilit(?:y|ies)|trade-?offs?|performance (?:issue|problem|regression)s?)\b/i
const STACK_TRACE = /(^\s*at\s+(?:async\s+|new\s+)?[^\s(]+(?:\s*\(.*\)|:\d+)|--- End of stack trace|Traceback \(most recent call last\))/m
const LIGHT = /^\/?(where (?:is|are)|list|show|find|grep|search|look up|commit|push|pull|stash|fix (?:the |a )?typo|format|lint)\b/i
const NOT_LIGHT = /\b(fix|implement|update|change|add|remove|delete|create|write|replace|refactor|build|migrate|rename|why|how|bug|fail\w*|error|broken|hang\w*|crash\w*|issue|design|architect\w*|debug\w*)\b/i
const FOLLOW_UP = /^(y(es|ep|eah)?|ok(ay)?|sure|go( ahead)?|do it|proceed|continue|carry on|lgtm|sounds good|please do|approved?)[\s.!,]*(please|thanks?)?[\s.!]*$/i
const FENCED = /```[\s\S]*?```/g

const tierOf = (model: string | undefined): ModelTier | undefined => (model ? TIERS.find(t => model.toLowerCase().includes(t)) : undefined)

// Swap only the family so the version and [1m] window stay; a dated snapshot of one family has no twin in another.
const modelFor = (resolved: string, tier: ModelTier) => resolved.replace(/opus|sonnet|haiku/i, tier).replace(/-\d{8}(?=\[|$)/, '')

function fit(choice: Choice, sessionModel: string): Choice {
  return choice.tier === 'haiku' && /\[1m\]/i.test(sessionModel) ? { tier: 'sonnet', reason: `${choice.reason}, no haiku with a 1M window` } : choice
}

function classify(text: string, defaultTier: ModelTier): Choice | undefined {
  const typed = text.trim()
  if (!typed || FOLLOW_UP.test(typed)) return undefined
  const firstLine = typed.split('\n', 1)[0] ?? ''
  if (THINK_HARD.test(firstLine)) return { tier: 'opus', reason: 'asked to think hard' }
  const hard = HARD_START.exec(typed) ?? HARD_ANY.exec(firstLine)
  if (hard) return { tier: 'opus', reason: `"${(hard[1] ?? hard[0]).toLowerCase()}"` }
  if (STACK_TRACE.test(text)) return { tier: 'opus', reason: 'stack trace' }
  if (typed.replace(FENCED, '').length > 2000) return { tier: 'opus', reason: 'long prompt' }
  if (typed.length <= 100 && LIGHT.test(typed) && !NOT_LIGHT.test(typed)) return { tier: 'haiku', reason: 'lookup or chore' }
  return { tier: defaultTier, reason: 'default' }
}

async function lockTo($: EngineInterface, s: State, next: Lock, sessionTier: ModelTier) {
  const last = await read($, lock)
  await update($, lock, () => next)
  s.hinted.clear()
  if (next.tier !== (last?.tier ?? sessionTier)) $.ui.toast(`Model for this session → ${next.tier} (${next.reason})`)
  $.ui.status(next.tier)
}

function hint($: EngineInterface, s: State, text: string, locked: Lock, defaultTier: ModelTier) {
  const wanted = classify(text, defaultTier)
  if (!wanted || locked.isPinned || RANK[wanted.tier] <= RANK[locked.tier] || s.hinted.has(wanted.tier)) return
  s.hinted.add(wanted.tier)
  $.ui.toast(`This looks like a job for ${wanted.tier} (${wanted.reason}). /route ${wanted.tier} switches, with a cold cache`)
}

const activeLock = async ($: EngineInterface) => ((await read($, isOff)) ? null : read($, lock))
const isPinnedModel = (frontmatter: SkillFrontmatter) => typeof frontmatter.model === 'string' && frontmatter.model !== 'inherit'

// A pinned inline skill holds its model for the rest of the turn, so the lock must not rewrite it.
async function routedModel($: EngineInterface, s: State, model: string, agentId: string | undefined) {
  if (agentId !== undefined || s.pinnedSkill !== undefined) return model
  const locked = await activeLock($)
  const from = tierOf(model)
  if (!locked || !from || from !== tierOf(locked.sessionModel) || from === locked.tier) return model
  return modelFor(model, locked.tier)
}

async function setOff($: EngineInterface, off: boolean) {
  await update($, isOff, () => off)
  await $.store.set('isOff', off)
}

type OpenRun = { skill: string; mode: SkillMode; pick: string; startedAt: number; usd0?: number; models: Set<string> }

const LOG_CAP = 2000
const RECENT = 15
/** The router's run state, made by each `register` call so a registration starts fresh. */
type State = {
  hinted: Set<ModelTier>
  pinnedSkill: string | undefined
  openRuns: OpenRun[]
  expected: string[]
  agentModels: Map<string, Set<string>>
  writing: Promise<unknown>
}

const isLogOff = async ($: EngineInterface) => (await $.store.get('isLogOff')) === true
const usdNow = async ($: EngineInterface) => (await $.session.usage()).cost?.usd
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const safely = (work: () => Promise<unknown>) => work().then(() => undefined, () => undefined)
const bareName = (skill: string) => skill.split(':').pop()

function findSkill<T>(items: T[], skill: string, nameOf: (item: T) => string) {
  return items.find(item => nameOf(item) === skill) ?? items.find(item => bareName(nameOf(item)) === bareName(skill))
}

function isRun(value: unknown): value is SkillRun {
  const run = value as Partial<SkillRun> | null
  return typeof run?.at === 'string' && typeof run.skill === 'string' && typeof run.pick === 'string' && Array.isArray(run.models) && typeof run.seconds === 'number'
}

function logPath($: EngineInterface) {
  const home = /^(.*[\\/]\.claude)[\\/]/.exec($.plugin.root)?.[1] ?? $.plugin.root
  return `${home}/state/model-router/skill-runs.jsonl`
}

async function readLog($: EngineInterface): Promise<SkillRun[]> {
  const path = logPath($)
  if (!(await $.fs.exists(path))) return []
  return (await $.fs.read(path))
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        const parsed: unknown = JSON.parse(line)
        return isRun(parsed) ? [parsed] : []
      } catch {
        return []
      }
    })
}

function appendLog($: EngineInterface, s: State, runs: SkillRun[]) {
  // One write at a time, so two runs closing together don't drop each other's line.
  s.writing = s.writing
    .then(async () => {
      const all = [...(await readLog($)), ...runs].slice(-LOG_CAP)
      await $.fs.write(logPath($), all.map(r => JSON.stringify(r)).join('\n') + '\n')
    })
    .catch(() => undefined)
  return s.writing
}

async function pickOf($: EngineInterface, frontmatter: SkillFrontmatter) {
  if (isPinnedModel(frontmatter)) return `pinned ${frontmatter.model}`
  const locked = await activeLock($)
  return locked ? `router ${locked.tier} (${locked.reason})` : 'session model'
}

async function openRun($: EngineInterface, s: State, run: Omit<OpenRun, 'startedAt' | 'usd0' | 'models'>) {
  const [startedAt, usd0] = await Promise.all([$.clock.now(), usdNow($)])
  const opened: OpenRun = { ...run, startedAt, usd0, models: new Set() }
  s.openRuns.push(opened)
  return opened
}

async function closeRuns($: EngineInterface, s: State, runs: OpenRun[], outcome?: SkillRun['outcome'], models?: (run: OpenRun) => Iterable<string>) {
  if (!runs.length) return
  const [now, usd] = await Promise.all([$.clock.now(), usdNow($)])
  for (const run of runs) {
    const i = s.openRuns.indexOf(run)
    if (i >= 0) s.openRuns.splice(i, 1)
  }
  await appendLog(
    $,
    s,
    runs.map(run => ({
      at: new Date(run.startedAt).toISOString(),
      skill: run.skill,
      mode: run.mode,
      pick: run.pick,
      models: [...new Set([...run.models, ...(models?.(run) ?? [])])],
      seconds: round((now - run.startedAt) / 1000, 1),
      ...(usd !== undefined && run.usd0 !== undefined && { usd: round(usd - run.usd0, 4) }),
      ...(outcome && { outcome }),
    })),
  )
}

function noteStep(s: State, agentId: string | undefined, model: string) {
  for (const run of s.openRuns) if (run.mode === 'inline') run.models.add(model)
  if (agentId !== undefined && s.openRuns.some(r => r.mode === 'fork')) {
    s.agentModels.set(agentId, (s.agentModels.get(agentId) ?? new Set()).add(model))
  }
}

const allAgentModels = (s: State) => [...s.agentModels.values()].flatMap(models => [...models])

async function skillLog($: EngineInterface) {
  const runs = await readLog($)
  if (!runs.length) return `No skill runs logged yet (${logPath($)}).`
  const money = (usd: number | undefined) => (usd === undefined ? '-' : `$${usd.toFixed(4)}`)
  const recent = runs.slice(-RECENT).map(r =>
    [r.at.slice(5, 16).replace('T', ' '), r.skill, r.pick, r.models.join(', ') || '-', `${r.seconds}s`, money(r.usd), r.outcome ?? ''].join(' | ').trimEnd(),
  )
  const bySkill = new Map<string, { count: number; seconds: number; usd: number }>()
  for (const r of runs) {
    const total = bySkill.get(r.skill) ?? { count: 0, seconds: 0, usd: 0 }
    bySkill.set(r.skill, { count: total.count + 1, seconds: total.seconds + r.seconds, usd: total.usd + (r.usd ?? 0) })
  }
  const totals = [...bySkill]
    .sort(([, a], [, b]) => b.usd - a.usd)
    .map(([skill, t]) => `${skill}: ${t.count} runs, avg ${round(t.seconds / t.count, 1)}s, ${money(t.usd)}`)
  return [`Last ${recent.length} skill runs (when UTC | skill | pick | model | time | cost):`, ...recent, '', 'Totals by skill:', ...totals, '', `Log: ${logPath($)}`].join('\n')
}

async function status($: EngineInterface, defaultTier: ModelTier) {
  const [off, locked, sessionModel, logOff] = await Promise.all([read($, isOff), read($, lock), $.session.model(), isLogOff($)])
  const subagents = Object.entries(SUBAGENTS).map(([type, tier]) => `${type} → ${tier}`).join(', ')
  const router = off ? 'off' : tierOf(sessionModel) ? `on (default ${defaultTier})` : `inactive: "${sessionModel}" is not a haiku, sonnet or opus model`
  return [
    `Router: ${router}`,
    `Session model: ${locked ? `${locked.tier} (${locked.reason})` : 'not chosen yet, picked from your first prompt'}`,
    `Subagents without a model: ${subagents}`,
    `Skill log: ${logOff ? 'off' : `on → ${logPath($)}`}`,
    'Use /route auto | off | haiku | sonnet | opus, or /route log [on | off]',
  ].join('\n')
}

export const register: Register = (on, options) => {
  const defaultTier: ModelTier = tierOf(String(options.defaultModel ?? 'sonnet')) ?? 'sonnet'
  const s: State = { hinted: new Set(), pinnedSkill: undefined, openRuns: [], expected: [], agentModels: new Map(), writing: Promise.resolve() }
  let typed: string | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'route', description: 'Model router: status, auto, off, lock haiku | sonnet | opus, or log [on | off]' })
    const stored = (await $.store.get('isOff')) === true
    await update($, isOff, () => stored)
    const locked = await read($, lock)
    if (locked && !stored) $.ui.status(locked.tier)
    return next(e)
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const tier = TIERS.find(t => t === arg)
    const logArg = /^log(?:\s+(on|off))?$/.exec(arg)
    if (logArg?.[1]) {
      await $.store.set('isLogOff', logArg[1] === 'off')
      return { text: `Skill log ${logArg[1]}.\n${await status($, defaultTier)}` }
    } else if (logArg) {
      return { text: await skillLog($) }
    } else if (arg === 'off') {
      await setOff($, true)
      $.ui.status(undefined)
    } else if (arg === 'auto' || arg === 'on') {
      await setOff($, false)
      await update($, lock, l => (l ? { ...l, isPinned: false } : l))
      $.ui.status((await read($, lock))?.tier)
    } else if (tier) {
      await setOff($, false)
      const [sessionModel, { startedAt }] = await Promise.all([$.session.model(), $.session.usage()])
      const sessionTier = tierOf(sessionModel)
      if (!sessionTier) return { text: await status($, defaultTier) }
      const choice = fit({ tier, reason: 'set with /route' }, sessionModel)
      await lockTo($, s, { ...choice, sessionModel, startedAt, isPinned: true }, sessionTier)
      return { text: `Locked to ${choice.tier} (${choice.reason}). The next request starts with a cold prompt cache.\n${await status($, defaultTier)}` }
    } else if (arg && arg !== 'status') {
      return { text: `Unknown option "${arg}".\n${await status($, defaultTier)}` }
    }
    return { text: await status($, defaultTier) }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta || e.turnId !== undefined || e.origin.kind === 'plugin') return next(e)
    typed = e.command ? `/${e.command.name} ${e.command.args}` : e.text
    s.expected.length = 0
    if (e.command) s.expected.push(e.command.name)
    try {
      return await next(e)
    } finally {
      typed = undefined
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const text = e.text && typed !== undefined ? typed : e.text
    if (await read($, isOff)) return next(e)

    const [sessionModel, { startedAt }, locked] = await Promise.all([$.session.model(), $.session.usage(), read($, lock)])
    const sessionTier = tierOf(sessionModel)
    if (!sessionTier) return next(e)

    // startedAt only moves on /clear, so a compacted conversation keeps its lock.
    const isNewConversation = !locked || locked.startedAt !== startedAt
    if (locked && locked.sessionModel !== sessionModel) {
      await lockTo($, s, { tier: sessionTier, reason: 'set with /model', sessionModel, startedAt, isPinned: true }, sessionTier)
    } else if (locked?.isPinned && isNewConversation) {
      await update($, lock, l => (l ? { ...l, startedAt } : l))
    } else if (!isNewConversation) {
      hint($, s, text, locked, defaultTier)
    } else if (!locked && (await $.session.messages()).some(m => m.role === 'assistant')) {
      await lockTo($, s, { tier: sessionTier, reason: 'resumed session', sessionModel, startedAt }, sessionTier)
    } else {
      const choice = fit(classify(text, defaultTier) ?? { tier: defaultTier, reason: 'default' }, sessionModel)
      await lockTo($, s, { ...choice, sessionModel, startedAt }, sessionTier)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const model = await routedModel($, s, e.model, e.agentId)
    noteStep(s, e.agentId, model)
    return yield* next(model === e.model ? e : { ...e, model })
  })

  // skill.prompt carries no agentId, so only skills the main loop asked for are logged, not a subagent's.
  on('skill.prompt', async ($, e, next) => {
    const asked = findSkill(s.expected, e.skill, name => name)
    if (asked === undefined) return next(e)
    s.expected.splice(s.expected.indexOf(asked), 1)
    const mode: SkillMode = e.frontmatter.context === 'fork' ? 'fork' : 'inline'
    if (mode === 'inline' && isPinnedModel(e.frontmatter)) s.pinnedSkill = e.skill
    await safely(async () => {
      if (await isLogOff($)) return
      if (mode === 'inline') await closeRuns($, s, s.openRuns.filter(r => r.mode === 'inline'))
      await openRun($, s, { skill: e.skill, mode, pick: await pickOf($, e.frontmatter) })
    })
    return next(e)
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    s.expected.push(e.skill)
    const unclaim = () => {
      const unclaimed = s.expected.indexOf(e.skill)
      if (unclaimed >= 0) s.expected.splice(unclaimed, 1)
    }
    if (await isLogOff($)) return next(e).finally(unclaim)
    const [startedAt, usd0] = await Promise.all([$.clock.now(), usdNow($)])
    const ran = await next(e).finally(unclaim)
    const forked = ran.deny === undefined && !ran.isError && ran.result.status === 'forked' ? ran.result : undefined
    if (forked) {
      const run = findSkill(s.openRuns.filter(r => r.mode === 'fork'), e.skill, r => r.skill) ?? { skill: e.skill, mode: 'fork', pick: 'unknown', startedAt, usd0, models: new Set<string>() }
      await closeRuns($, s, [run], forked.background ? 'background' : forked.success ? undefined : 'failed', () => s.agentModels.get(forked.agentId) ?? [])
      s.agentModels.delete(forked.agentId)
    } else if (ran.deny !== undefined || ran.isError) {
      const run = findSkill(s.openRuns, e.skill, r => r.skill)
      if (run) await closeRuns($, s, [run], 'failed')
    } else if (ran.result.status === 'inline' && ran.result.model) {
      findSkill(s.openRuns.filter(r => r.mode === 'inline'), e.skill, r => r.skill)?.models.add(ran.result.model)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      if (e.agentId === undefined) {
        await safely(async () => {
          if (!(await isLogOff($))) await closeRuns($, s, [...s.openRuns], e.isAborted ? 'interrupted' : undefined, run => (run.mode === 'fork' ? allAgentModels(s) : []))
        })
        s.openRuns.length = 0
        s.agentModels.clear()
        s.pinnedSkill = undefined
      }
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const target = SUBAGENTS[e.subagentType]
    const isPlain = !e.model && !e.fork && !e.resume && !e.workflow && !e.isTeammate && e.provider.plugin === 'engine'
    if (!target || !isPlain || (await read($, isOff))) return next(e)
    const locked = e.parentAgentId === undefined ? await read($, lock) : null
    const parent = locked && tierOf(e.parentModel) === tierOf(locked.sessionModel) ? locked.tier : tierOf(e.parentModel)
    if (!parent || RANK[target] >= RANK[parent]) return next(e)
    return next({ ...e, model: target })
  })
}
