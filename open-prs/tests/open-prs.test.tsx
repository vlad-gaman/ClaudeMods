import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, UiOpenResult } from 'claude-code'

const SURFACES = ['terminal', 'desktop', 'vscode'] as const
const NO_PR = 'no pull requests found for branch "main"'
const NO_REPO = 'No GitHub or Azure DevOps remote here (not in a git repo).'
const noRemote = (url: string) => `No GitHub or Azure DevOps remote here (origin is ${url}).`
const GH_DOWN = "Couldn't load PRs: gh failed or timed out. Will retry."
const AZ_DOWN = "Couldn't load PRs: az failed or timed out. Will retry."
const AZURE = 'https://commify@dev.azure.com/commify/Titan%20Accounts/_git/api'
const ADO_WEB = 'https://dev.azure.com/commify/Titan%20Accounts'
const BUILD = 'https://commify.visualstudio.com/p/_build/results?buildId=7'
const ACTIONS = 'https://github.com/esendex/api/actions/runs/1/job/2'
const REQUIRED = '○ review required'

type Answer = { exitCode: number; stdout: string; stderr: string }
type Cli = Record<'list' | 'view' | 'checks' | 'counts' | 'branch' | 'azList' | 'azMine' | 'azRuns' | 'azRepo' | 'azThreads', () => Answer | Promise<Answer>>
type Check = Record<string, unknown>

const ok = (data: unknown): Answer => ({ exitCode: 0, stdout: JSON.stringify(data), stderr: '' })
const fail = (stderr: string): Answer => ({ exitCode: 1, stdout: '', stderr })
const raw = (stdout: string): Answer => ({ exitCode: 0, stdout, stderr: '' })

const check = (name: string, conclusion: string | null, detailsUrl: string, status = 'COMPLETED'): Check =>
  ({ __typename: 'CheckRun', name, status, conclusion, detailsUrl })
const pr = (number: number, login: string | null = 'alice', isDraft = false, checks: Check[] = []) => ({
  number,
  title: `PR ${number}`,
  author: login === null ? null : { login },
  isDraft,
  url: `https://github.com/esendex/api/pull/${number}`,
  reviewDecision: 'REVIEW_REQUIRED',
  latestReviews: [],
  statusCheckRollup: checks,
})
const counts = (...nodes: [number, number][]) =>
  ({ data: { repository: { pullRequests: { nodes: nodes.map(([number, totalCommentsCount]) => ({ number, totalCommentsCount })) } } } })
const refChecks = (nodes: Check[]) => ({ data: { repository: { ref: { target: { statusCheckRollup: { contexts: { nodes } } } } } } })
const azPr = (number: number, isDraft = false, status = 'active', votes: Check[] = []) =>
  ({ number, title: `PR ${number}`, author: 'Bob', isDraft, status, votes })
const azRun = (id: number, branch: string, status: string, result: string | null, definition = 1, repo = 'repo-id') =>
  ({ id, branch, status, result, name: `ci-${definition}`, definition, repo })

const OPEN = [pr(12), pr(15, null, true)]
const BRANCH = { number: 12, title: 'PR 12', state: 'OPEN', isDraft: false }
const TURN = { answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

const ROUTES: [string, keyof Cli][] = [
  ['git branch --show-current', 'branch'],
  ['gh pr list ', 'list'],
  ['gh pr view ', 'view'],
  ['gh api graphql ', 'checks'],
  ['az pipelines runs list ', 'azRuns'],
  ['az repos show ', 'azRepo'],
  ['az devops invoke ', 'azThreads'],
]

function route(argv: readonly string[]): keyof Cli {
  const line = argv.join(' ')
  if (line.startsWith('gh api graphql ') && line.includes('totalCommentsCount')) return 'counts'
  if (line.startsWith('az repos pr list ')) return argv.includes('--source-branch') ? 'azMine' : 'azList'
  const found = ROUTES.find(([prefix]) => line.startsWith(prefix))
  if (!found) throw new Error(`unexpected command: ${line}`)
  return found[1]
}

function engine(
  on: On,
  answers: Partial<Cli> = {},
  remote: string | null = 'git@github.com:esendex/api.git',
  placed: UiOpenResult = { isPlaced: true },
) {
  const clock = mock.clock(on, { now: 0 })
  const cli: Cli = {
    list: () => ok(OPEN),
    view: () => ok(BRANCH),
    checks: () => ok(refChecks([])),
    counts: () => ok(counts()),
    branch: () => raw('feature\n'),
    azList: () => ok([]),
    azMine: () => ok([]),
    azRuns: () => ok([]),
    azRepo: () => ok('repo-id'),
    azThreads: () => fail('TF401019'),
    ...answers,
  }
  const calls: string[][] = []
  const opens: string[] = []
  const commands: string[] = []
  const repoReads = { count: 0 }

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('command.register', (_, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_, e) => {
    opens.push(e.id)
    return { value: placed }
  })
  on('session.repo', () => {
    repoReads.count++
    return { value: remote === null ? null : { root: '/repo', remote, internal: false, name: null } }
  })
  on('process.run', async (_, e) => {
    calls.push([...e.argv])
    return { value: { ...(await cli[route(e.argv)]()), isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const callsTo = (key: keyof Cli) => calls.filter(argv => route(argv) === key)
  return { clock, cli, calls, callsTo, opens, commands, repoReads }
}

async function start($: Engine, clock: ReturnType<typeof mock.clock>) {
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await clock.settle()
}

const head = (count: number | string) => ['Pull requests', `${count} open`]
const NO_RUNS = ['Pipelines', 'No runs found.']

const mountPane = ($: Engine, surface: (typeof SURFACES)[number] = 'desktop') =>
  $.ui.mount({
    plugin: 'open-prs',
    surface,
    component: 'Pane',
    requestId: 'open-prs',
    props: { title: 'Open PRs', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })

async function pane($: Engine, surface: (typeof SURFACES)[number] = 'desktop') {
  const ui = await mountPane($, surface)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const found = await ui.findAll({ type: 'Link' })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  await ui.unmount()
  return { texts, links: found.map(l => l.text), hrefs: found.map(l => l.props.href), buttons }
}

async function press($: Engine, clock: ReturnType<typeof mock.clock>, key: string) {
  const ui = await mountPane($)
  await ui.press({ key })
  await ui.unmount()
  await clock.settle()
}

async function layout($: Engine, isFullscreen: boolean) {
  const ui = await $.ui.mount({
    plugin: 'open-prs',
    surface: 'terminal',
    component: 'AbovePrompt',
    viewport: { columns: 200, rows: 50, isFullscreen },
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 195, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts
}

const prs = ($: Engine) =>
  $.command.run({ command: 'prs', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

describe('pane', () => {
  test('lists each open PR with its author and this branch, on every surface', async ($, on) => {
    // Arrange
    const { clock } = engine(on)

    // Act
    await start($, clock)

    // Assert
    for (const surface of SURFACES) {
      const { texts, links } = await pane($, surface)
      expect(texts).toEqual([...head(2), 'This branch: #12 open', 'PR 12', 'alice', '← this branch', REQUIRED, 'PR 15', 'ghost · draft', REQUIRED, ...NO_RUNS])
      expect(links).toEqual(['esendex/api', '#12', '#15'])
    }
  })

  test('asks gh for the open PRs with their checks, the branch PR and the branch checks', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on)

    // Act
    await start($, clock)

    // Assert
    expect(callsTo('list')[0]).toEqual(
      ['gh', 'pr', 'list', '-R', 'esendex/api', '--state', 'open', '--limit', '51', '--json', 'number,title,author,isDraft,url,reviewDecision,latestReviews,statusCheckRollup'],
    )
    expect(callsTo('view')[0]).toEqual(['gh', 'pr', 'view', '--json', 'number,title,state,isDraft'])
    expect(callsTo('checks')[0]?.slice(-6)).toEqual(['-f', 'owner=esendex', '-f', 'name=api', '-f', 'ref=refs/heads/feature'])
  })

  test('caps the count at 50+ and lists fifty, with their pipelines', async ($, on) => {
    // Arrange
    const many = Array.from({ length: 51 }, (_, i) => pr(i + 1, 'alice', false, [check('ci', 'SUCCESS', BUILD)]))
    const { clock } = engine(on, { list: () => ok(many), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    const { texts, links } = await pane($)
    expect(texts.slice(0, 2)).toEqual(head('50+'))
    expect(links).toContain('#50')
    expect(links.filter(link => /^#\d+$/.test(link))).toHaveLength(50)
    expect(links).not.toContain('#51')
    const runs = texts.slice(texts.indexOf('Pipelines')).filter(text => /^#\d+$/.test(text))
    expect(runs).toHaveLength(50)
    expect(runs).not.toContain('#51')
  })

  test('says it is loading until the first answer', async ($, on) => {
    // Arrange
    engine(on)

    // Act
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

    // Assert
    expect((await pane($)).texts).toEqual(['Loading…'])
  })

  test('shows the branch PR state without a row when it is not open', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { list: () => ok([]), view: () => ok({ ...BRANCH, state: 'MERGED' }) })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([...head(0), 'This branch: #12 merged', ...NO_RUNS])
  })

  test('marks a draft branch PR as draft', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { list: () => ok([]), view: () => ok({ ...BRANCH, isDraft: true }) })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toContain('This branch: #12 draft')
  })

  test('says so when gh is not installed', async ($, on) => {
    // Arrange
    const missing = () => {
      throw new Error('spawn gh ENOENT')
    }
    const { clock, opens } = engine(on, { list: missing, view: missing, checks: missing })

    // Act
    await start($, clock)

    // Assert
    expect(opens).toEqual([])
    expect((await pane($)).texts).toEqual([GH_DOWN])
  })

  test('says so when gh answers something other than JSON', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { list: () => raw('not json'), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([GH_DOWN])
  })

  test('says az failed when the Azure DevOps PR list fails', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { azList: () => fail('az: command not found') }, AZURE)

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([AZ_DOWN])
  })

  test('retries a failed first load after 30 seconds and shows the PRs', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on, { list: () => fail('timeout') })
    await start($, clock)
    cli.list = () => ok(OPEN)

    // Act
    await clock.advance(29_000)
    await clock.settle()
    const early = callsTo('list').length
    await clock.advance(1_000)
    await clock.settle()

    // Assert
    expect(early).toBe(1)
    expect(callsTo('list').length).toBe(2)
    expect((await pane($)).texts.slice(0, 2)).toEqual(head(2))
  })

  test('retries once quickly, then waits for the regular refresh', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, { list: () => fail('timeout') })
    await start($, clock)

    // Act
    await clock.advance(2 * 60_000)
    await clock.settle()
    const beforeTick = callsTo('list').length
    await clock.advance(90_000)
    await clock.settle()

    // Assert
    expect(beforeTick).toBe(2)
    expect(callsTo('list').length).toBe(3)
    expect((await pane($)).texts).toEqual([GH_DOWN])
  })

  test('the refresh button fetches the PRs again', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on)
    await start($, clock)
    cli.list = () => ok([pr(20)])

    // Act
    await press($, clock, 'refresh')

    // Assert
    expect(callsTo('list').length).toBe(2)
    expect((await pane($)).texts.slice(0, 2)).toEqual(head(1))
  })

  test('the refresh button loads the PRs after a failed call', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on, { list: () => fail('timeout') })
    await start($, clock)
    const failedPane = await pane($)
    cli.list = () => ok(OPEN)

    // Act
    await press($, clock, 'refresh')

    // Assert
    expect(failedPane.buttons).toEqual(['Refresh'])
    expect((await pane($)).texts.slice(0, 2)).toEqual(head(2))
  })

  test('a successful refresh cancels the pending quick retry', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on, { list: () => fail('timeout') })
    await start($, clock)
    cli.list = () => ok(OPEN)
    await press($, clock, 'refresh')

    // Act
    await clock.advance(30_000)
    await clock.settle()

    // Assert
    expect(callsTo('list').length).toBe(2)
  })

  test('shows Refreshing… from the press until the fetch settles', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on)
    await start($, clock)
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    cli.list = async () => {
      await gate
      return ok(OPEN)
    }
    const ui = await mountPane($)

    // Act
    await ui.press({ key: 'refresh' })
    const during = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    release()
    await clock.settle()
    const after = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    await ui.unmount()

    // Assert
    expect(during).toContain('Refreshing…')
    expect(after).not.toContain('Refreshing…')
  })

  test('does not show Refreshing… for a background refresh', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on)
    await start($, clock)
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    cli.list = async () => {
      await gate
      return ok(OPEN)
    }

    // Act
    await clock.advance(3 * 60_000)
    const during = (await pane($)).texts
    release()
    await clock.settle()

    // Assert
    expect(callsTo('list').length).toBe(2)
    expect(during).not.toContain('Refreshing…')
  })

  test('Refreshing… clears when the pressed fetch fails', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on)
    await start($, clock)
    cli.list = () => fail('timeout')

    // Act
    await press($, clock, 'refresh')

    // Assert
    expect((await pane($)).texts).not.toContain('Refreshing…')
  })

  test('no refresh button without a remote', async ($, on) => {
    // Arrange
    const { clock } = engine(on, {}, null)

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).buttons).toEqual([])
  })

  test('a success after failing allows another quick retry', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on, { list: () => fail('timeout') })
    await start($, clock)
    cli.list = () => ok(OPEN)
    await clock.advance(30_000)
    await clock.settle()
    cli.list = () => fail('timeout')

    // Act
    await clock.advance(3 * 60_000 + 30_000)
    await clock.settle()

    // Assert
    expect(callsTo('list').length).toBe(4)
  })

  test('says so outside a git repo, calling nothing', async ($, on) => {
    // Arrange
    const { clock, calls } = engine(on, {}, null)

    // Act
    await start($, clock)

    // Assert
    expect(calls).toEqual([])
    expect((await pane($)).texts).toEqual([NO_REPO])
  })
})

describe('GitHub pipelines', () => {
  test("shows a PR's Azure pipeline, not its jobs or other checks", async ($, on) => {
    // Arrange
    const checks = [
      check('SonarCloud', 'SUCCESS', 'https://sonarcloud.io'),
      check('api-ci', 'FAILURE', BUILD),
      check('api-ci (Build)', 'SUCCESS', `${BUILD}&view=logs&jobId=1`),
      check('Lint', 'FAILURE', ACTIONS),
      check('api-deploy', 'SUCCESS', BUILD.replace('=7', '=8')),
    ]
    const { clock } = engine(on, { list: () => ok([pr(12, 'alice', false, checks)]), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    const { texts, links, hrefs } = await pane($)
    expect(texts).toEqual([...head(1), 'PR 12', 'alice', REQUIRED, 'Pipelines', '#12', '● failed'])
    expect(links).toEqual(['esendex/api', '#12', 'api-ci'])
    expect(hrefs[2]).toBe(BUILD)
  })

  test("falls back to the repo's own GitHub Actions workflow", async ($, on) => {
    // Arrange
    const checks = [
      { ...check('build', null, ACTIONS, 'IN_PROGRESS'), workflowName: 'CI' },
      check('Veracode', 'FAILURE', 'https://github.com/esendex/veracode/actions/runs/3'),
    ]
    const { clock } = engine(on, { list: () => ok([pr(12, 'alice', false, checks)]), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    const { texts, links } = await pane($)
    expect(texts).toEqual([...head(1), 'PR 12', 'alice', REQUIRED, 'Pipelines', '#12', '● running'])
    expect(links).toEqual(['esendex/api', '#12', 'CI'])
  })

  test('lists the branch run first, then each PR that has a run, in PR order', async ($, on) => {
    // Arrange
    const open = [
      pr(12, 'alice', false, [check('ci', 'FAILURE', BUILD)]),
      pr(15),
      pr(16, 'alice', false, [check('ci', 'SUCCESS', BUILD)]),
    ]
    const branchChecks = () => ok(refChecks([check('ci', null, BUILD, 'IN_PROGRESS')]))
    const { clock } = engine(on, { list: () => ok(open), view: () => fail(NO_PR), checks: branchChecks })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([
      ...head(3), 'PR 12', 'alice', REQUIRED, 'PR 15', 'alice', REQUIRED, 'PR 16', 'alice', REQUIRED,
      'Pipelines', 'This branch', '● running', '#12', '● failed', '#16', '● succeeded',
    ])
  })

  test('shows no pipeline for a PR whose checks are elsewhere', async ($, on) => {
    // Arrange
    const checks = [check('SonarCloud', 'SUCCESS', 'https://sonarcloud.io')]
    const { clock } = engine(on, { list: () => ok([pr(12, 'alice', false, checks)]), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([...head(1), 'PR 12', 'alice', REQUIRED, ...NO_RUNS])
  })

  const STATES: [string, Check, string | null][] = [
    ['a passed check', check('ci', 'SUCCESS', BUILD), '● succeeded'],
    ['a cancelled check', check('ci', 'CANCELLED', BUILD), '● cancelled'],
    ['a timed-out check', check('ci', 'TIMED_OUT', BUILD), '● failed'],
    ['a queued check', check('ci', null, BUILD, 'QUEUED'), '● queued'],
    ['a skipped check', check('ci', 'SKIPPED', BUILD), null],
    ['a pending status', { __typename: 'StatusContext', context: 'ci', state: 'PENDING', targetUrl: BUILD }, '● running'],
    ['an errored status', { __typename: 'StatusContext', context: 'ci', state: 'ERROR', targetUrl: BUILD }, '● failed'],
  ]
  for (const [name, node, shown] of STATES) {
    test(`the branch pipeline shows ${name} as ${shown ?? 'nothing'}`, async ($, on) => {
      // Arrange
      const { clock } = engine(on, { list: () => ok([]), view: () => fail(NO_PR), checks: () => ok(refChecks([node])) })

      // Act
      await start($, clock)

      // Assert
      const { texts } = await pane($)
      expect(texts).toEqual(shown ? [...head(0), 'Pipelines', 'This branch', shown] : [...head(0), ...NO_RUNS])
    })
  }

  test('an unpushed branch shows no pipeline', async ($, on) => {
    // Arrange
    const unpushed = { data: { repository: { ref: null } } }
    const { clock } = engine(on, { list: () => ok([]), view: () => fail(NO_PR), checks: () => ok(unpushed) })

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([...head(0), ...NO_RUNS])
  })

  test('a detached HEAD skips the branch checks', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, { branch: () => raw('\n') })

    // Act
    await start($, clock)

    // Assert
    expect(callsTo('checks')).toEqual([])
  })

  test('a failed branch-checks call keeps the last branch pipeline', async ($, on) => {
    // Arrange
    const passed = () => ok(refChecks([check('ci', 'SUCCESS', BUILD)]))
    const { clock, cli, callsTo } = engine(on, { list: () => ok([]), view: () => fail(NO_PR), checks: passed })
    await start($, clock)
    cli.checks = () => fail('HTTP 502')
    const before = callsTo('checks').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('checks').length).toBeGreaterThan(before)
    expect((await pane($)).texts).toContain('● succeeded')
  })

  test('the branch pipeline goes once the branch is no longer on GitHub', async ($, on) => {
    // Arrange
    const passed = () => ok(refChecks([check('ci', 'SUCCESS', BUILD)]))
    const { clock, cli } = engine(on, { list: () => ok([]), view: () => fail(NO_PR), checks: passed })
    await start($, clock)
    cli.checks = () => ok({ data: { repository: { ref: null } } })

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect((await pane($)).texts).toEqual([...head(0), ...NO_RUNS])
  })
})

describe('GitHub reviews and comments', () => {
  const DECISIONS: [string, string[], string][] = [
    ['APPROVED', [], '✓ approved'],
    ['CHANGES_REQUESTED', [], '✗ changes requested'],
    ['REVIEW_REQUIRED', ['APPROVED'], REQUIRED],
    ['', ['APPROVED'], '✓ approved'],
    ['', ['APPROVED', 'CHANGES_REQUESTED'], '✗ changes requested'],
    ['', ['COMMENTED'], REQUIRED],
  ]
  for (const [decision, reviews, shown] of DECISIONS) {
    test(`a ${decision || 'blank'} decision with ${reviews.join('+') || 'no'} reviews shows as "${shown}"`, async ($, on) => {
      // Arrange
      const reviewed = { ...pr(12), reviewDecision: decision, latestReviews: reviews.map(state => ({ state })) }
      const { clock } = engine(on, { list: () => ok([reviewed]), view: () => fail(NO_PR) })

      // Act
      await start($, clock)

      // Assert
      expect((await pane($)).texts).toEqual([...head(1), 'PR 12', 'alice', shown, ...NO_RUNS])
    })
  }

  test("shows each PR's comment count beside its review state", async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, { counts: () => ok(counts([12, 3], [15, 1])) })

    // Act
    await start($, clock)

    // Assert
    const { texts } = await pane($)
    expect(texts).toEqual([
      ...head(2), 'This branch: #12 open', 'PR 12', 'alice', '← this branch', REQUIRED, '3 comments',
      'PR 15', 'ghost · draft', REQUIRED, '1 comment', ...NO_RUNS,
    ])
    expect(callsTo('counts')[0]).toEqual(expect.arrayContaining(['owner=esendex', 'name=api']))
  })

  test('a failed count call keeps the last counts', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on, { counts: () => ok(counts([12, 3])) })
    await start($, clock)
    cli.counts = () => fail('HTTP 502')
    const before = callsTo('counts').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('counts').length).toBeGreaterThan(before)
    expect((await pane($)).texts).toContain('3 comments')
  })

  test('a new count replaces the last one', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on, { counts: () => ok(counts([12, 3])) })
    await start($, clock)
    cli.counts = () => ok(counts([12, 5]))

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    const { texts } = await pane($)
    expect(texts).toContain('5 comments')
    expect(texts).not.toContain('3 comments')
  })

  test('a PR missing from the counts keeps its last count', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on, { counts: () => ok(counts([12, 3])) })
    await start($, clock)
    cli.counts = () => ok(counts())

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect((await pane($)).texts).toContain('3 comments')
  })
})

describe('Azure DevOps reviews and comments', () => {
  const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const prOf = (argv: readonly string[]) => Number(argv.find(arg => arg.startsWith('pullRequestId='))?.split('=')[1])
  const THREADS = [
    { isDeleted: false, comments: [{ type: 'text', isDeleted: null }, { type: 'system', isDeleted: null }, { type: 'text', isDeleted: true }] },
    { isDeleted: true, comments: [{ type: 'text', isDeleted: null }] },
  ]

  const VOTES: [string, Check[], string][] = [
    ['no reviewers', [], REQUIRED],
    ['an approval', [{ vote: 10 }], '✓ approved'],
    ['an approval with suggestions', [{ vote: 5 }], '✓ approved'],
    ['an approval and a wait for the author', [{ vote: 10 }, { vote: -5 }], '✗ changes requested'],
    ['a rejection', [{ vote: -10 }], '✗ changes requested'],
    ['an approval and a required reviewer yet to vote', [{ vote: 10 }, { vote: 0, isRequired: true }], REQUIRED],
    ['an approval and a required group yet to vote', [{ vote: 10 }, { vote: 0, isRequired: true, isGroup: true }], '✓ approved'],
  ]
  for (const [name, votes, shown] of VOTES) {
    test(`a PR with ${name} shows as "${shown}"`, async ($, on) => {
      // Arrange
      const { clock } = engine(on, { azList: () => ok([azPr(7, false, 'active', votes)]) }, AZURE)

      // Act
      await start($, clock)

      // Assert
      expect((await pane($)).texts).toEqual([...head(1), 'PR 7', 'Bob', shown, ...NO_RUNS])
    })
  }

  test("counts the text comments left in a PR's threads", async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, { azList: () => ok([azPr(7)]), azThreads: () => ok(THREADS) }, AZURE)

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([...head(1), 'PR 7', 'Bob', REQUIRED, '1 comment', ...NO_RUNS])
    expect(callsTo('azThreads')[0]).toEqual(expect.arrayContaining(['project=Titan Accounts', 'repositoryId=api', 'pullRequestId=7']))
  })

  test('asks for counts again only after ten minutes', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, { azList: () => ok([azPr(7)]), azThreads: () => ok(THREADS) }, AZURE)
    await start($, clock)

    // Act
    await clock.advance(9 * 60_000)
    const early = callsTo('azThreads').length
    await clock.advance(3 * 60_000)

    // Assert
    expect(early).toBe(1)
    expect(callsTo('azThreads')).toHaveLength(2)
    expect((await pane($)).texts).toContain('1 comment')
  })

  test('asks for at most twelve counts per pass, then the rest', async ($, on) => {
    // Arrange
    const many = Array.from({ length: 15 }, (_, i) => azPr(i + 1))
    const { clock, callsTo } = engine(on, { azList: () => ok(many), azThreads: () => ok([]) }, AZURE)
    await start($, clock)
    const first = callsTo('azThreads').map(prOf)

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(first).toEqual(ids(1, 12))
    expect(callsTo('azThreads').map(prOf).slice(12)).toEqual(ids(13, 15))
    expect((await pane($)).texts.filter(text => text === '0 comments')).toHaveLength(15)
  })

  test('counts never-counted PRs first, then the oldest counts', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on, { azList: () => ok(ids(1, 15).map(n => azPr(n))), azThreads: () => ok([]) }, AZURE)
    await start($, clock)
    await clock.advance(9 * 60_000)
    cli.azList = () => ok(ids(1, 20).map(n => azPr(n)))
    const before = callsTo('azThreads').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(before).toBe(15)
    expect(callsTo('azThreads').slice(before).map(prOf)).toEqual([...ids(16, 20), ...ids(1, 7)])
  })

  const UNKNOWN: [string, Answer][] = [
    ['a failed', fail('TF401019')],
    ['an empty', ok(null)],
  ]
  for (const [name, answer] of UNKNOWN) {
    test(`${name} threads call keeps the last count until a new one replaces it`, async ($, on) => {
      // Arrange
      const { clock, cli, callsTo } = engine(on, { azList: () => ok([azPr(7)]), azThreads: () => ok(THREADS) }, AZURE)
      await start($, clock)
      cli.azThreads = () => answer
      await clock.advance(12 * 60_000)
      const kept = (await pane($)).texts
      cli.azThreads = () => ok([...THREADS, { isDeleted: false, comments: [{ type: 'text', isDeleted: false }] }])

      // Act
      await clock.advance(3 * 60_000)

      // Assert
      expect(kept).toContain('1 comment')
      expect(callsTo('azThreads')).toHaveLength(3)
      expect((await pane($)).texts).toContain('2 comments')
    })

    test(`${name} threads call shows no count and is asked again next refresh`, async ($, on) => {
      // Arrange
      const { clock, cli, callsTo } = engine(on, { azList: () => ok([azPr(7)]), azThreads: () => answer }, AZURE)
      await start($, clock)
      const shown = (await pane($)).texts
      cli.azThreads = () => ok(THREADS)

      // Act
      await clock.advance(3 * 60_000)

      // Assert
      expect(shown).toEqual([...head(1), 'PR 7', 'Bob', REQUIRED, ...NO_RUNS])
      expect(callsTo('azThreads')).toHaveLength(2)
      expect((await pane($)).texts).toContain('1 comment')
    })
  }
})

describe('Azure DevOps', () => {
  test('lists the active PRs with Azure DevOps links', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { azList: () => ok([azPr(7), azPr(8, true)]) }, AZURE)

    // Act
    await start($, clock)

    // Assert
    const { texts, links, hrefs } = await pane($)
    expect(texts).toEqual([...head(2), 'PR 7', 'Bob', REQUIRED, 'PR 8', 'Bob · draft', REQUIRED, ...NO_RUNS])
    expect(links).toEqual(['Titan Accounts/api', '#7', '#8'])
    expect(hrefs.slice(0, 2)).toEqual([`${ADO_WEB}/_git/api/pullrequests`, `${ADO_WEB}/_git/api/pullrequest/7`])
  })

  test('asks az for the active PRs, the branch PR, the runs and the repo id', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, {}, AZURE)
    const scope = ['--org', 'https://dev.azure.com/commify', '--project', 'Titan Accounts', '-o', 'json']

    // Act
    await start($, clock)

    // Assert
    expect(callsTo('azList')[0]?.slice(0, 16)).toEqual(['az', 'repos', 'pr', 'list', ...scope, '--repository', 'api', '--status', 'active', '--top', '51'])
    expect(callsTo('azMine')[0]).toContain('refs/heads/feature')
    expect(callsTo('azRuns')[0]?.slice(0, 14)).toEqual(['az', 'pipelines', 'runs', 'list', ...scope, '--top', '200', '--query-order', 'QueueTimeDesc'])
    expect(callsTo('azRepo')[0]?.slice(0, 13)).toEqual(['az', 'repos', 'show', ...scope, '--repository', 'api', '--query', 'id'])
    expect(callsTo('list')).toEqual([])
  })

  test("shows a PR's worst pipeline from each definition's latest run in this repo", async ($, on) => {
    // Arrange
    const runs = [
      azRun(30, 'refs/pull/7/merge', 'completed', 'succeeded', 1),
      azRun(29, 'refs/pull/7/merge', 'completed', 'failed', 1),
      azRun(28, 'refs/pull/7/merge', 'completed', 'partiallySucceeded', 3),
      azRun(27, 'refs/pull/7/merge', 'inProgress', null, 2),
      azRun(26, 'refs/pull/8/merge', 'completed', 'failed', 1, 'other-repo'),
    ]
    const { clock } = engine(on, { azList: () => ok([azPr(7), azPr(8)]), azRuns: () => ok(runs) }, AZURE)

    // Act
    await start($, clock)

    // Assert
    const { texts, links, hrefs } = await pane($)
    expect(texts).toEqual([...head(2), 'PR 7', 'Bob', REQUIRED, 'PR 8', 'Bob', REQUIRED, 'Pipelines', '#7', '● partial'])
    expect(links).toContain('ci-3')
    expect(hrefs).toContain(`${ADO_WEB}/_build/results?buildId=28`)
  })

  const RUN_STATES: [string, string | null, string][] = [
    ['completed', 'succeeded', '● succeeded'],
    ['completed', 'partiallySucceeded', '● partial'],
    ['completed', 'canceled', '● cancelled'],
    ['completed', 'failed', '● failed'],
    ['inProgress', null, '● running'],
    ['notStarted', null, '● queued'],
    ['cancelling', null, '● cancelled'],
  ]
  for (const [status, result, shown] of RUN_STATES) {
    test(`the branch run ${status}/${result ?? '-'} shows as ${shown}`, async ($, on) => {
      // Arrange
      const { clock } = engine(on, { azRuns: () => ok([azRun(5, 'refs/heads/feature', status, result)]) }, AZURE)

      // Act
      await start($, clock)

      // Assert
      expect((await pane($)).texts).toEqual([...head(0), 'Pipelines', 'This branch', shown])
    })
  }

  const BRANCH_STATES: [string, boolean, string][] = [
    ['active', false, 'This branch: #7 open'],
    ['active', true, 'This branch: #7 draft'],
    ['completed', false, 'This branch: #7 merged'],
    ['abandoned', false, 'This branch: #7 closed'],
  ]
  for (const [status, isDraft, shown] of BRANCH_STATES) {
    test(`the branch PR ${status}${isDraft ? ' as draft' : ''} shows as "${shown}"`, async ($, on) => {
      // Arrange
      const { clock } = engine(on, { azMine: () => ok([azPr(7, isDraft, status)]) }, AZURE)

      // Act
      await start($, clock)

      // Assert
      expect((await pane($)).texts).toContain(shown)
    })
  }

  test("a PR keeps its last run once it drops out of the project's latest runs", async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(
      on,
      { azList: () => ok([azPr(7)]), azRuns: () => ok([azRun(30, 'refs/pull/7/merge', 'completed', 'succeeded')]) },
      AZURE,
    )
    await start($, clock)
    cli.azRuns = () => ok([])
    const before = callsTo('azRuns').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('azRuns').length).toBeGreaterThan(before)
    expect((await pane($)).texts).toContain('● succeeded')
  })

  test('a failed runs call keeps the PR and branch runs', async ($, on) => {
    // Arrange
    const runs = [azRun(6, 'refs/pull/7/merge', 'completed', 'succeeded'), azRun(5, 'refs/heads/feature', 'completed', 'failed')]
    const { clock, cli, callsTo } = engine(on, { azList: () => ok([azPr(7)]), azRuns: () => ok(runs) }, AZURE)
    await start($, clock)
    cli.azRuns = () => fail('TF400813')
    const before = callsTo('azRuns').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('azRuns').length).toBeGreaterThan(before)
    expect((await pane($)).texts).toEqual([...head(1), 'PR 7', 'Bob', REQUIRED, 'Pipelines', 'This branch', '● failed', '#7', '● succeeded'])
  })

  test('the branch PR goes once the branch has none', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on, { azMine: () => ok([azPr(7)]) }, AZURE)
    await start($, clock)
    cli.azMine = () => ok([])

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect((await pane($)).texts).toEqual([...head(0), ...NO_RUNS])
  })

  test('asks for the repo id once', async ($, on) => {
    // Arrange
    const { clock, callsTo } = engine(on, {}, AZURE)
    await start($, clock)

    // Act
    await clock.advance(2 * 3 * 60_000)

    // Assert
    expect(callsTo('azList').length).toBeGreaterThan(1)
    expect(callsTo('azRepo')).toHaveLength(1)
  })
})

describe('opening', () => {
  test('opens the pane once when the repo has open PRs', async ($, on) => {
    // Arrange
    const { clock, opens, callsTo } = engine(on)
    await start($, clock)

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('list')).toHaveLength(2)
    expect(opens).toEqual(['open-prs'])
  })

  test('opens the pane when an Azure DevOps repo has active PRs', async ($, on) => {
    // Arrange
    const { clock, opens } = engine(on, { azList: () => ok([azPr(7)]) }, AZURE)

    // Act
    await start($, clock)

    // Assert
    expect(opens).toEqual(['open-prs'])
  })

  test('leaves the pane closed when the repo has no open PRs', async ($, on) => {
    // Arrange
    const { clock, opens } = engine(on, { list: () => ok([]), view: () => fail(NO_PR) })

    // Act
    await start($, clock)

    // Assert
    expect(opens).toEqual([])
  })

  test('leaves the pane closed where it would sit above the prompt', async ($, on) => {
    // Arrange
    const { clock, opens } = engine(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await layout($, false)

    // Act
    await clock.settle()

    // Assert
    expect(opens).toEqual([])
  })

  test('opens the pane where it docks beside the transcript', async ($, on) => {
    // Arrange
    const { clock, opens } = engine(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await layout($, true)

    // Act
    await clock.settle()

    // Assert
    expect(opens).toEqual(['open-prs'])
  })

  test('leaves the band above the prompt to what is beneath', async ($, on) => {
    // Arrange
    const { clock } = engine(on)
    await start($, clock)

    // Act
    const texts = await layout($, true)

    // Assert
    expect(texts).toEqual(['engine'])
  })

  test('/prs opens the pane even when the repo has no open PRs', async ($, on) => {
    // Arrange
    const { clock, opens, commands } = engine(on, { list: () => ok([]), view: () => fail(NO_PR) })
    await start($, clock)

    // Act
    const result = await prs($)

    // Assert
    expect(commands).toEqual(['prs'])
    expect(result).toMatchObject({ text: 'Open PRs pane opened.' })
    expect(opens).toEqual(['open-prs'])
  })

  test('/prs fetches again', async ($, on) => {
    // Arrange
    const { clock, cli, opens } = engine(on, { list: () => ok([]), view: () => fail(NO_PR) })
    await start($, clock)
    cli.list = () => ok(OPEN)

    // Act
    await prs($)
    await clock.settle()

    // Assert
    expect((await pane($)).texts[1]).toBe('2 open')
    expect(opens).toEqual(['open-prs'])
  })

  test('/prs says why the pane is not drawn yet', async ($, on) => {
    // Arrange
    const { clock } = engine(on, { list: () => ok([]), view: () => fail(NO_PR) }, undefined, {
      isPlaced: false,
      reason: 'the terminal is 100 columns wide',
    })
    await start($, clock)

    // Act
    const result = await prs($)

    // Assert
    expect(result).toMatchObject({ text: 'Open PRs pane is waiting: the terminal is 100 columns wide' })
  })
})

describe('remotes', () => {
  const GITHUB = [
    'https://github.com/o/r',
    'https://github.com/o/r.git',
    'https://github.com/o/r/',
    'ssh://git@github.com:22/o/r',
    'https://user:tok@github.com/o/r',
  ]
  const AZURE_REMOTES = [
    'https://dev.azure.com/commify/Titan%20Accounts/_git/api',
    'https://commify@dev.azure.com/commify/Titan%20Accounts/_git/api',
    'https://commify.visualstudio.com/Titan%20Accounts/_git/api',
    'https://commify.visualstudio.com/DefaultCollection/Titan%20Accounts/_git/api',
    'git@ssh.dev.azure.com:v3/commify/Titan%20Accounts/api',
    'ssh://git@ssh.dev.azure.com/v3/commify/Titan%20Accounts/api',
    'commify@vs-ssh.visualstudio.com:v3/commify/Titan%20Accounts/api',
  ]
  const ELSEWHERE = [
    'https://gitlab.com/o/r',
    'https://notgithub.com/o/r',
    'https://github.com/o/r/extra',
    'https://github.example.com/o/r',
  ]

  for (const remote of GITHUB) {
    test(`${remote} is read as o/r`, async ($, on) => {
      // Arrange
      const { clock } = engine(on, { view: () => fail(NO_PR) }, remote)

      // Act
      await start($, clock)

      // Assert
      expect((await pane($)).links[0]).toBe('o/r')
    })
  }

  for (const remote of AZURE_REMOTES) {
    test(`${remote} is read as commify's Titan Accounts/api`, async ($, on) => {
      // Arrange
      const { clock, callsTo } = engine(on, {}, remote)

      // Act
      await start($, clock)

      // Assert
      expect(callsTo('azList')[0]?.slice(4, 8)).toEqual(['--org', 'https://dev.azure.com/commify', '--project', 'Titan Accounts'])
      expect((await pane($)).links[0]).toBe('Titan Accounts/api')
    })
  }

  for (const remote of ELSEWHERE) {
    test(`${remote} is neither GitHub nor Azure DevOps and calls nothing`, async ($, on) => {
      // Arrange
      const { clock, calls, opens, repoReads } = engine(on, {}, remote)

      // Act
      await start($, clock)

      // Assert
      expect(repoReads.count).toBeGreaterThan(0)
      expect(calls).toEqual([])
      expect(opens).toEqual([])
      expect((await pane($)).texts).toEqual([noRemote(remote)])
    })
  }

  test('an unrecognised remote is shown without its credentials', async ($, on) => {
    // Arrange
    const { clock } = engine(on, {}, 'https://user:secret@gitlab.com/o/r')

    // Act
    await start($, clock)

    // Assert
    expect((await pane($)).texts).toEqual([noRemote('https://gitlab.com/o/r')])
  })
})

describe('refresh', () => {
  test('a turn after a minute fetches again', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on)
    await start($, clock)
    cli.list = () => ok([pr(20)])
    await clock.advance(61_000)

    // Act
    await $.turn.complete(TURN)
    await clock.settle()

    // Assert
    expect((await pane($)).texts[1]).toBe('1 open')
  })

  test('a turn within a minute does not call gh again', async ($, on) => {
    // Arrange
    const { clock, calls } = engine(on)
    await start($, clock)
    const before = calls.length
    await clock.advance(30_000)

    // Act
    await $.turn.complete(TURN)
    await clock.settle()

    // Assert
    expect(calls.length).toBe(before)
  })

  test('a failed PR list keeps the last one shown', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on)
    await start($, clock)
    cli.list = () => fail('HTTP 502')
    const before = callsTo('list').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('list').length).toBeGreaterThan(before)
    expect((await pane($)).texts[1]).toBe('2 open')
  })

  test('a failed branch lookup keeps the last branch PR', async ($, on) => {
    // Arrange
    const { clock, cli, callsTo } = engine(on)
    await start($, clock)
    cli.view = () => fail('HTTP 502')
    const before = callsTo('view').length

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect(callsTo('view').length).toBeGreaterThan(before)
    expect((await pane($)).texts).toContain('This branch: #12 open')
  })

  test('the PR list empties once the repo has none open', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on)
    await start($, clock)
    cli.list = () => ok([])

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    expect((await pane($)).texts[1]).toBe('0 open')
  })

  test('the branch PR goes once the branch has none', async ($, on) => {
    // Arrange
    const { clock, cli } = engine(on)
    await start($, clock)
    cli.view = () => fail(NO_PR)

    // Act
    await clock.advance(3 * 60_000)

    // Assert
    const { texts } = await pane($)
    expect(texts).not.toContain('This branch: #12 open')
    expect(texts).not.toContain('← this branch')
  })
})
