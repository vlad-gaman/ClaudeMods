import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'
import { paneEngine } from './pane-lifecycle-engine'

// Pane lifecycle (GLOSSARY.md) for Open PRs.
// Reached here: open; a close by a plugin (origin `plugin`) is not a dismissal, so the next refresh opens the pane
// again; `/prs` opens it again. A test cannot raise the person's close (origin `person`) or an unload (origin
// `unload`), so the dismissal the person's close records is read in hooks/register.tsx, not tested here.
// The harness registers the hooks once per test, so a reload is a second `session.start` on the same engine.

const PR = {
  number: 12,
  title: 'PR 12',
  author: { login: 'alice' },
  isDraft: false,
  url: 'https://github.com/esendex/api/pull/12',
  reviewDecision: 'REVIEW_REQUIRED',
  latestReviews: [],
  statusCheckRollup: [],
}
const BRANCH = { number: 12, title: 'PR 12', state: 'OPEN', isDraft: false }
const ok = (data: unknown) => ({ exitCode: 0, stdout: JSON.stringify(data), stderr: '' })

// A plugin beside Open PRs that closes its pane the way a plugin does: `$.ui.close`, origin `plugin`.
const driver: Plugin = {
  name: 'pane-driver',
  register: on => {
    on('command.run', { command: 'close-prs' }, async $ => {
      await $.ui.close({ id: 'open-prs' })
      return { text: 'closed' }
    })
  },
}

function setup(on: On) {
  const pane = paneEngine(on)
  const clock = mock.clock(on, { now: 0 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/repo', remote: 'git@github.com:esendex/api.git', internal: false, name: null } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('process.run', (_, e) => {
    const line = e.argv.join(' ')
    const answer = line.startsWith('gh pr list ')
      ? ok([PR])
      : line.startsWith('gh pr view ')
        ? ok(BRANCH)
        : line === 'git branch --show-current'
          ? { exitCode: 0, stdout: 'feature\n', stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'not stubbed' }

    return { value: { ...answer, isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const start = async ($: Engine) => {
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    await clock.settle()
  }
  const command = ($: Engine, name: string, args = '') =>
    $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  return { pane, clock, start, command }
}

test('open: the pane opens when the repo has open PRs', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, start } = setup(on)

  // Act
  await start($)

  // Assert
  expect(pane.panes.map(p => p.id)).toEqual(['open-prs'])
  expect(pane.opened).toEqual(['open-prs'])
})

test('closed by a plugin is not a dismissal: the next refresh opens it again', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, clock, start, command } = setup(on)
  await start($)

  // Act
  await command($, 'close-prs')
  await clock.advance(3 * 60_000)

  // Assert
  expect(pane.closed).toEqual([{ id: 'open-prs', kind: 'plugin' }])
  expect(pane.panes.map(p => p.id)).toEqual(['open-prs'])
  expect(pane.opened).toEqual(['open-prs', 'open-prs'])
})

test('reopen by command: /prs opens the pane again after a plugin closed it', { plugins: [driver] }, async ($, on) => {
  // Arrange
  const { pane, start, command } = setup(on)
  await start($)
  await command($, 'close-prs')

  // Act
  const result = await command($, 'prs')

  // Assert
  expect(result).toMatchObject({ text: 'Open PRs pane opened.' })
  expect(pane.panes.map(p => p.id)).toEqual(['open-prs'])
})
