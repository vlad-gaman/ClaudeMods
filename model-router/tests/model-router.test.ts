import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentSpawnInput, On, PromptOrigin, SkillFrontmatter } from 'claude-code'

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-5-5'

type World = { model: string; startedAt: number; hasHistory: boolean; usd: number }
type Seen = { toasts: string[]; status: (string | undefined)[]; steps: { model: string; effort: unknown }[]; spawns: (string | undefined)[] }

function engine(top: Engine, on: On, world: World, store?: Record<string, unknown>) {
  const seen: Seen = { toasts: [], status: [], steps: [], spawns: [] }
  mock.store(on, store)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: world.model }))
  on('session.usage', () => ({ value: { startedAt: world.startedAt, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: world.usd } } }))
  on('session.messages', () => ({ value: world.hasHistory ? [{ role: 'assistant', text: 'done', toolUses: [] }] : [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    seen.status.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', async (_, e) => {
    if (e.command?.name !== 'route') await top.turn.start({ text: e.text, turnId: 't' })
    return { text: e.text }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    seen.steps.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('agent.spawn', (_, e) => {
    seen.spawns.push(e.model)
    return { model: e.model ?? e.parentModel }
  })
  return seen
}

const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

async function step($: Engine, world: World, model = world.model, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model, effort: 'high', messageCount: 1, ...(agentId && { agentId }) })
  while (!(await stream.next()).done);
  world.hasHistory = true
}

async function turn($: Engine, world: World, text: string, model = world.model) {
  await $.turn.start({ text, turnId: 't' })
  await step($, world, model)
}

type Submit = { text: string; command?: { name: string; args: string }; origin?: PromptOrigin }

async function submit($: Engine, world: World, { text, command, origin = { kind: 'composer' } }: Submit) {
  await $.prompt.submit({ text, wait: false, origin, ...(command && { command }) })
  if (command?.name !== 'route') await step($, world)
}

const route = ($: Engine, args: string) =>
  $.command.run({ command: 'route', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

const spawn = ($: Engine, subagentType: string, parentModel: string, extra: Partial<AgentSpawnInput> = {}) =>
  $.agent.spawn({
    tool_use_id: 'tu',
    prompt: 'p',
    description: 'd',
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel,
    background: false,
    fork: false,
    ...extra,
  })

const fresh = (model = OPUS): World => ({ model, startedAt: 1, hasHistory: false, usd: 0 })

const CLASSIFIED: [string, string, string][] = [
  ['ultrathink about the cache layout', 'opus', 'asked to think hard'],
  ['Please design the retry policy', 'opus', '"design"'],
  ['Why does the worker hit a race condition?', 'opus', '"race condition"'],
  ['The job fails with:\n   at Scheduler.Run (Scheduler.cs:42)', 'opus', 'stack trace'],
  ['a '.repeat(1001), 'opus', 'long prompt'],
  ['```\n' + 'a'.repeat(2500) + '\n```\nWhat does this return?', 'sonnet', 'default'],
  ['commit the changes', 'haiku', 'lookup or chore'],
  ['list why the build is slow', 'sonnet', 'default'],
  ['show ' + 'the config '.repeat(10), 'sonnet', 'default'],
  ['go ahead', 'sonnet', 'default'],
  ['', 'sonnet', 'default'],
]

for (const [prompt, tier, reason] of CLASSIFIED) {
  test(`the first prompt ${JSON.stringify(prompt.slice(0, 30))} locks to ${tier} (${reason})`, async ($, on) => {
    // Arrange
    const world = fresh()
    engine($, on, world)
    await start($)

    // Act
    await turn($, world, prompt)
    const answer = await route($, 'status')

    // Assert
    expect(answer.text).toContain(`Session model: ${tier} (${reason})`)
  })
}

test('a hard first prompt locks the session to opus and says so', async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'Investigate why the scheduler is slow')

  // Assert
  expect(seen.steps).toEqual([{ model: OPUS, effort: 'high' }])
  expect(seen.toasts).toEqual(['Model for this session → opus ("investigate")'])
  expect(seen.status.at(-1)).toBe('opus')
})

test('a lookup first prompt locks to haiku and keeps the effort', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps).toEqual([{ model: HAIKU, effort: 'high' }])
})

test('a first prompt that matches the session model locks it without a toast', async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'Add a retry to the payment client')

  // Assert
  expect(seen.steps).toEqual([{ model: SONNET, effort: 'high' }])
  expect(seen.toasts).toEqual([])
})

test('the default model comes from the options', { options: { defaultModel: 'opus' } }, async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'Add a retry to the payment client')

  // Assert
  expect(seen.steps).toEqual([{ model: OPUS, effort: 'high' }])
})

test('a slash command is classified by its name, not its expanded text', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await submit($, world, { text: 'Write a detailed commit message and implement the changes', command: { name: 'commit', args: '' } })

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU])
})

test('a prompt from another plugin is classified by its own text', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await submit($, world, { text: '/route auto', command: { name: 'route', args: 'auto' } })

  // Act
  await submit($, world, { text: 'Design the retry policy', origin: { kind: 'plugin', name: 'other' } })

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([OPUS])
  expect(seen.toasts).toEqual([])
})

test('a later prompt never switches the model', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')

  // Act
  await turn($, world, 'Debug the race condition in the worker')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU, HAIKU])
})

test('a later prompt for a dearer model hints once per tier', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  seen.toasts.length = 0

  // Act
  await turn($, world, 'Add a retry to the payment client')
  await turn($, world, 'Add a timeout too')
  await turn($, world, 'Debug the race condition in the worker')
  await turn($, world, 'Investigate the memory leak')
  await turn($, world, 'list the tests')

  // Assert
  expect(seen.toasts).toEqual([expect.stringMatching(/\/route sonnet/), expect.stringMatching(/\/route opus/)])
})

test('a model the user chose is never hinted', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await route($, 'haiku')
  seen.toasts.length = 0

  // Act
  await turn($, world, 'Debug the race condition in the worker')

  // Assert
  expect(seen.toasts).toEqual([])
})

test('the hints start over after /clear', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  await turn($, world, 'Add a retry to the payment client')
  Object.assign(world, { startedAt: 2, hasHistory: false })
  await turn($, world, 'where is the config file?')
  seen.toasts.length = 0

  // Act
  await turn($, world, 'Add a retry to the payment client')

  // Assert
  expect(seen.toasts).toEqual([expect.stringMatching(/\/route sonnet/)])
})

test('a compacted conversation keeps its lock', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  world.hasHistory = false

  // Act
  await turn($, world, 'Design the retry policy')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU, HAIKU])
})

test('/clear picks the model again from the next prompt', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  Object.assign(world, { startedAt: 2, hasHistory: false })

  // Act
  await turn($, world, 'Design the retry policy for the payment client')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU, OPUS])
})

test('a resumed session keeps the model it already ran on', async ($, on) => {
  // Arrange
  const world = { ...fresh(), hasHistory: true }
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps).toEqual([{ model: OPUS, effort: 'high' }])
  expect(seen.toasts).toEqual([])
})

test('a /model change is adopted and survives /clear', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  world.model = SONNET

  // Act
  await turn($, world, 'where is the readme?')
  Object.assign(world, { startedAt: 2, hasHistory: false })
  await turn($, world, 'where is the readme?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU, SONNET, SONNET])
  expect(seen.toasts.at(-1)).toBe('Model for this session → sonnet (set with /model)')
})

test('/route <tier> locks the model and survives /clear', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'Design the retry policy')

  // Act
  const answer = await route($, 'sonnet')
  await turn($, world, 'Debug the race condition')
  Object.assign(world, { startedAt: 2, hasHistory: false })
  await turn($, world, 'Debug the race condition')

  // Assert
  expect(answer.text).toMatch(/^Locked to sonnet \(set with \/route\)/)
  expect(seen.steps.map(s => s.model)).toEqual([OPUS, SONNET, SONNET])
})

test('/route auto lets the next conversation pick again', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await route($, 'sonnet')
  await turn($, world, 'Debug the race condition')

  // Act
  await route($, 'auto')
  Object.assign(world, { startedAt: 2, hasHistory: false })
  await turn($, world, 'Debug the race condition')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([SONNET, OPUS])
})

test('/route off leaves every step alone and clears the status', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await route($, 'off')
  await turn($, world, 'where is the config file?')
  const answer = await route($, 'status')

  // Assert
  expect(seen.steps).toEqual([{ model: OPUS, effort: 'high' }])
  expect(seen.status.at(-1)).toBeUndefined()
  expect(answer.text).toContain('Router: off')
})

test('/route on turns the router back on', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await route($, 'off')

  // Act
  await route($, 'on')
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU])
})

test('a stored off switch is read at session start', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world, { isOff: true })

  // Act
  await start($)
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([OPUS])
})

test('a reload shows the locked model in the status again', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')
  seen.status.length = 0

  // Act
  await start($)

  // Assert
  expect(seen.status).toEqual(['haiku'])
})

test('/route with an unknown option says so', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  await start($)

  // Act
  const answer = await route($, 'fast')

  // Assert
  expect(answer.text).toMatch(/^Unknown option "fast"\.\nRouter: on \(default sonnet\)/)
})

test('an auto pick on a 1M-window session model never chooses haiku', async ($, on) => {
  // Arrange
  const world = fresh(`${OPUS}[1m]`)
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([`${SONNET}[1m]`])
  expect(seen.toasts).toEqual(['Model for this session → sonnet (lookup or chore, no haiku with a 1M window)'])
})

test('/route haiku on a 1M-window session model locks to sonnet', async ($, on) => {
  // Arrange
  const world = fresh(`${OPUS}[1m]`)
  const seen = engine($, on, world)
  await start($)

  // Act
  const answer = await route($, 'haiku')
  await turn($, world, 'list the tests')

  // Assert
  expect(answer.text).toMatch(/^Locked to sonnet \(set with \/route, no haiku with a 1M window\)/)
  expect(seen.steps.map(s => s.model)).toEqual([`${SONNET}[1m]`])
})

test('a dated model ID loses its date when the family changes', async ($, on) => {
  // Arrange
  const world = fresh('claude-opus-5-5-20260901')
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([HAIKU])
})

test('a step on a fallback model is left alone', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?', SONNET)

  // Assert
  expect(seen.steps).toEqual([{ model: SONNET, effort: 'high' }])
})

test('an unknown session model turns the router off', async ($, on) => {
  // Arrange
  const world = fresh('my-gateway-model')
  const seen = engine($, on, world)
  await start($)

  // Act
  await turn($, world, 'where is the config file?')
  const routed = await route($, 'haiku')
  await turn($, world, 'where is the config file?')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual(['my-gateway-model', 'my-gateway-model'])
  expect(routed.text).toMatch(/^Router: inactive/)
})

test('a subagent turn neither picks the model nor is routed', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await $.turn.start({ text: 'where is the config file?', turnId: 't', agentId: 'a1' })
  const unlocked = await route($, 'status')
  await turn($, world, 'Design the retry policy')
  await route($, 'haiku')
  await step($, world, OPUS, 'a1')

  // Assert
  expect(unlocked.text).toContain('Session model: not chosen yet')
  expect(seen.steps.map(s => s.model)).toEqual([OPUS, OPUS])
})

test('plain subagents go to a cheaper model, never a dearer one', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await spawn($, 'Explore', OPUS)
  await spawn($, 'general-purpose', OPUS)
  await spawn($, 'general-purpose', SONNET)
  await spawn($, 'Explore', OPUS, { model: 'opus' })
  await spawn($, 'Plan', OPUS)
  await spawn($, 'Explore', HAIKU)

  // Assert
  expect(seen.spawns).toEqual(['haiku', 'sonnet', undefined, 'opus', undefined, undefined])
})

test('forks, teammates, plugin agents and router-off spawns are left alone', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)

  // Act
  await spawn($, 'Explore', OPUS, { fork: true })
  await spawn($, 'Explore', OPUS, { isTeammate: true })
  await spawn($, 'Explore', OPUS, { provider: { plugin: 'other', tier: 'user' } })
  await route($, 'off')
  await spawn($, 'Explore', OPUS)

  // Assert
  expect(seen.spawns).toEqual([undefined, undefined, undefined, undefined])
})

test('subagents of a main loop locked to haiku are not routed up', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')

  // Act
  await spawn($, 'general-purpose', OPUS)

  // Assert
  expect(seen.spawns).toEqual([undefined])
})

test('a nested subagent is routed by its own parent model, not the main lock', async ($, on) => {
  // Arrange
  const world = fresh()
  const seen = engine($, on, world)
  await start($)
  await turn($, world, 'where is the config file?')

  // Act
  await spawn($, 'general-purpose', OPUS, { parentAgentId: 'a1' })

  // Assert
  expect(seen.spawns).toEqual(['sonnet'])
})

const NINE_AM = Date.UTC(2026, 9, 27, 9)

type SkillCase = {
  frontmatter?: SkillFrontmatter
  ms?: number
  usd?: number
  fork?: { success?: boolean; background?: boolean; agentId?: string; model?: string }
  fails?: 'deny' | 'error'
  agentId?: string
  promptedAs?: string
}

function skillWorld(top: Engine, on: On, world: World, { isWriteBroken = false } = {}) {
  let now = NINE_AM
  let current: SkillCase = {}
  const files = new Map<string, string>()
  const spend = (ms: number, usd: number) => {
    now += ms
    world.usd += usd
  }
  on('clock.now', () => ({ value: now }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    if (isWriteBroken) throw new Error('disk full')
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Skill' }, async (_, e) => {
    const { frontmatter = {}, ms = 0, usd = 0, fork, fails, promptedAs = e.skill } = current
    const forkId = fork?.agentId ?? 'fork-1'
    if (fails === 'deny') return { deny: 'not allowed' }
    await top.skill.prompt({ skill: promptedAs, text: 'steps', frontmatter })
    if (fork) await step(top, world, fork.model ?? HAIKU, forkId)
    spend(ms, usd)
    if (fails === 'error') return { isError: true as const, result: undefined, text: 'boom' }
    return fork
      ? { result: { success: fork.success ?? true, commandName: e.skill, status: 'forked' as const, agentId: forkId, result: 'done', ...(fork.background && { background: true }) } }
      : { result: { success: true, commandName: e.skill, status: 'inline' as const } }
  })
  return {
    spend,
    use: (skill: string, skillCase: SkillCase = {}) => {
      current = skillCase
      return top.tool.call({ tool: 'Skill', skill, ...(skillCase.agentId && { agentId: skillCase.agentId }) })
    },
    complete: (isAborted = false) => top.turn.complete({ turnId: 't', answer: '', durationMs: 0, isAborted, reason: isAborted ? 'aborted' : 'answer' }),
    runs: () => [...files.values()].join('').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>),
  }
}

const PINNED_FORK = { frontmatter: { context: 'fork', model: 'haiku' }, fork: {}, ms: 2500, usd: 0.0123 }

test('a pinned forked skill logs its pick, model, time and cost when the Skill call returns', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('sonar-status', PINNED_FORK)
  const runs = skills.runs()
  await skills.complete()

  // Assert
  expect(runs).toEqual([{ at: '2026-10-27T09:00:00.000Z', skill: 'sonar-status', mode: 'fork', pick: 'pinned haiku', models: [HAIKU], seconds: 2.5, usd: 0.0123 }])
})

test('an inline skill logs the router pick and the model it ran on at the end of the turn', async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await turn($, world, 'Investigate why the scheduler is slow')

  // Act
  await skills.use('grilling', { ms: 4000, usd: 0.05 })
  await step($, world)
  await skills.complete()

  // Assert
  expect(skills.runs()).toEqual([
    { at: '2026-10-27T09:00:00.000Z', skill: 'grilling', mode: 'inline', pick: 'router opus ("investigate")', models: [OPUS], seconds: 4, usd: 0.05 },
  ])
})

test('a typed forked skill is logged at the end of the turn with its agent model', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await $.prompt.submit({ text: '/sonar-status', wait: false, origin: { kind: 'composer' }, command: { name: 'sonar-status', args: '' } })
  await $.skill.prompt({ skill: 'sonar-status', text: 'steps', frontmatter: PINNED_FORK.frontmatter })
  await step($, world, HAIKU, 'fork-1')
  skills.spend(1000, 0.002)
  await skills.complete()

  // Assert
  expect(skills.runs()).toEqual([{ at: '2026-10-27T09:00:00.000Z', skill: 'sonar-status', mode: 'fork', pick: 'pinned haiku', models: [HAIKU], seconds: 1, usd: 0.002 }])
})

const OUTCOMES: [string, SkillCase['fork'], string][] = [
  ['a failed fork', { success: false }, 'failed'],
  ['a background fork', { background: true }, 'background'],
]

for (const [name, fork, outcome] of OUTCOMES) {
  test(`${name} is logged with the outcome ${outcome}`, async ($, on) => {
    // Arrange
    const world = fresh()
    engine($, on, world)
    const skills = skillWorld($, on, world)
    await start($)

    // Act
    await skills.use('sonar-status', { ...PINNED_FORK, fork })
    await skills.complete()

    // Assert
    expect(skills.runs().map(r => r.outcome)).toEqual([outcome])
  })
}

test('an interrupted turn logs its open inline skill as interrupted', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('grilling')
  await skills.complete(true)

  // Assert
  expect(skills.runs().map(r => r.outcome)).toEqual(['interrupted'])
})

test("a subagent's skill is not logged", async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('grilling', { agentId: 'sub-1' })
  await skills.complete()

  // Assert
  expect(skills.runs()).toEqual([])
})

test('/route log off stops logging and /route log on starts it again', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  const off = await route($, 'log off')
  await skills.use('sonar-status', PINNED_FORK)
  await skills.complete()
  const wasEmpty = skills.runs().length === 0
  await route($, 'log on')
  await skills.use('sonar-status', PINNED_FORK)
  await skills.complete()

  // Assert
  expect(off.text).toContain('Skill log: off')
  expect(wasEmpty).toBe(true)
  expect(skills.runs()).toHaveLength(1)
})

test('/route log lists recent runs and totals by skill', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await skills.use('sonar-status', PINNED_FORK)
  await skills.use('sonar-status', PINNED_FORK)
  await skills.complete()

  // Act
  const answer = await route($, 'log')

  // Assert
  expect(answer.text).toContain('10-27 09:00 | sonar-status | pinned haiku | claude-haiku-5-5 | 2.5s | $0.0123')
  expect(answer.text).toContain('sonar-status: 2 runs, avg 2.5s, $0.0246')
})

test('/route log says so when nothing is logged yet', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  skillWorld($, on, world)
  await start($)

  // Act
  const answer = await route($, 'log')

  // Assert
  expect(answer.text).toContain('No skill runs logged yet')
})

test('a second inline skill closes the first, each with its own time and cost', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('grilling', { ms: 1000, usd: 0.01 })
  await skills.use('tdd', { ms: 2000, usd: 0.02 })
  await skills.complete()

  // Assert
  expect(skills.runs().map(r => [r.skill, r.seconds, r.usd])).toEqual([
    ['grilling', 1, 0.01],
    ['tdd', 2, 0.02],
  ])
})

const FAILURES: [string, SkillCase][] = [
  ['an inline skill', { fails: 'error' }],
  ['a forked skill', { ...PINNED_FORK, fails: 'error' }],
]

for (const [name, skillCase] of FAILURES) {
  test(`${name} whose Skill call errors is logged as failed`, async ($, on) => {
    // Arrange
    const world = fresh()
    engine($, on, world)
    const skills = skillWorld($, on, world)
    await start($)

    // Act
    await skills.use('grilling', skillCase)
    await skills.complete()

    // Assert
    expect(skills.runs().map(r => r.outcome)).toEqual(['failed'])
  })
}

test('a denied Skill call logs nothing and leaves no claim behind for a preload of the same name', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('grilling', { fails: 'deny' })
  await $.skill.prompt({ skill: 'grilling', text: 'steps', frontmatter: {} })
  await skills.complete()

  // Assert
  expect(skills.runs()).toEqual([])
})

test('a typed command that never expanded a skill leaves no claim for a later preload', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await $.prompt.submit({ text: '/grilling', wait: false, origin: { kind: 'composer' }, command: { name: 'grilling', args: '' } })

  // Act
  await $.prompt.submit({ text: '/compact', wait: false, origin: { kind: 'composer' }, command: { name: 'compact', args: '' } })
  await $.skill.prompt({ skill: 'grilling', text: 'steps', frontmatter: {} })
  await skills.complete()

  // Assert
  expect(skills.runs()).toEqual([])
})

test('a log that cannot be written never breaks the skill or the turn', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world, { isWriteBroken: true })
  await start($)

  // Act
  const ran = await skills.use('sonar-status', PINNED_FORK)
  await skills.use('grilling')
  const done = await skills.complete()

  // Assert
  expect(ran.result).toMatchObject({ status: 'forked', success: true })
  expect(done.text).toBe('')
})

test('a skill expanded under its plugin name is matched to the bare name the Skill call used', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('sonar-status', { ...PINNED_FORK, promptedAs: 'sonarqube:sonar-status' })
  await skills.complete()

  // Assert
  expect(skills.runs()).toMatchObject([{ skill: 'sonarqube:sonar-status', mode: 'fork', pick: 'pinned haiku', models: [HAIKU] }])
})

test('two forks in one turn each log only their own model and rounded time', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)

  // Act
  await skills.use('sonar-status', { ...PINNED_FORK, ms: 1234, fork: { agentId: 'fork-a', model: HAIKU } })
  await skills.use('sonar-measures', { ...PINNED_FORK, ms: 1000, fork: { agentId: 'fork-b', model: SONNET } })
  await skills.complete()

  // Assert
  expect(skills.runs().map(r => [r.skill, r.models, r.seconds])).toEqual([
    ['sonar-status', [HAIKU], 1.2],
    ['sonar-measures', [SONNET], 1],
  ])
})

test("a subagent's turn ending does not close the main loop's inline skill", async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await skills.use('grilling')

  // Act
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 0, isAborted: false, reason: 'answer', agentId: 'sub-1' })
  const beforeMain = skills.runs()
  await skills.complete()

  // Assert
  expect(beforeMain).toEqual([])
  expect(skills.runs().map(r => r.skill)).toEqual(['grilling'])
})

test("a plain subagent's model before a typed fork opens is not credited to the fork", async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await step($, world, SONNET, 'sub-x')

  // Act
  await $.prompt.submit({ text: '/sonar-status', wait: false, origin: { kind: 'composer' }, command: { name: 'sonar-status', args: '' } })
  await $.skill.prompt({ skill: 'sonar-status', text: 'steps', frontmatter: PINNED_FORK.frontmatter })
  await step($, world, HAIKU, 'fork-1')
  await skills.complete()

  // Assert
  expect(skills.runs().map(r => r.models)).toEqual([[HAIKU]])
})

test('a typed fork does not take the model of a fork that already logged in the same turn', async ($, on) => {
  // Arrange
  const world = fresh()
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await $.prompt.submit({ text: '/sonar-status', wait: false, origin: { kind: 'composer' }, command: { name: 'sonar-status', args: '' } })
  await $.skill.prompt({ skill: 'sonar-status', text: 'steps', frontmatter: PINNED_FORK.frontmatter })
  await step($, world, HAIKU, 'fork-1')

  // Act
  await skills.use('sonar-measures', { ...PINNED_FORK, fork: { agentId: 'fork-b', model: SONNET } })
  await skills.complete()

  // Assert
  expect(skills.runs().map(r => [r.skill, r.models])).toEqual([
    ['sonar-measures', [SONNET]],
    ['sonar-status', [HAIKU]],
  ])
})

test('a pinned inline skill keeps its model while the lock points elsewhere', async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  const seen = engine($, on, world, { isLogOff: true })
  const skills = skillWorld($, on, world)
  await start($)
  await turn($, world, 'Investigate why the scheduler is slow')

  // Act
  await $.prompt.submit({ text: '/pipeline', wait: false, origin: { kind: 'composer' }, command: { name: 'pipeline', args: '' } })
  await $.skill.prompt({ skill: 'pipeline', text: 'steps', frontmatter: { model: 'sonnet' } })
  await step($, world)
  await skills.complete()
  await turn($, world, 'Carry on with the next ticket')

  // Assert
  expect(seen.steps.map(s => s.model)).toEqual([OPUS, SONNET, OPUS])
  expect(skills.runs()).toEqual([])
})

test('an inline skill logs the models of the subagents it spawns', async ($, on) => {
  // Arrange
  const world = fresh(SONNET)
  engine($, on, world)
  const skills = skillWorld($, on, world)
  await start($)
  await skills.use('pipeline', { frontmatter: { model: 'sonnet' } })

  // Act
  await step($, world)
  await step($, world, OPUS, 'impl-1')
  await step($, world, SONNET, 'tester-1')
  await skills.complete()

  // Assert
  expect(skills.runs().map(r => [r.pick, r.models])).toEqual([['pinned sonnet', [SONNET, OPUS]]])
})
