import { describe, expect, test } from 'claude-code/testing'

import type { Port } from '../hooks/provider'
import { listWorktrees, parseWorktrees, sessionBranchesOf } from '../hooks/worktrees'

// `git worktree list --porcelain`: one block per worktree, blocks separated by a blank line.
const porcelain = (...blocks: string[][]) => blocks.map(lines => lines.join('\n')).join('\n\n') + '\n'
const MAIN = ['worktree D:/ClaudeMods', 'HEAD 1', 'branch refs/heads/master']

describe('parseWorktrees', () => {
  test('maps each worktree to its branch, and the first entry is the main checkout', () => {
    // Arrange
    const text = porcelain(
      MAIN,
      ['worktree D:/wt/feature', 'HEAD 2', 'branch refs/heads/feature/login'],
      ['worktree D:/wt/several words', 'HEAD 3', 'branch refs/heads/topic'],
    )

    // Act
    const worktrees = parseWorktrees(text)

    // Assert
    expect(worktrees).toEqual([
      { path: 'D:/ClaudeMods', branch: 'master', isMain: true },
      { path: 'D:/wt/feature', branch: 'feature/login', isMain: false },
      { path: 'D:/wt/several words', branch: 'topic', isMain: false },
    ])
  })

  test('a detached HEAD has no branch', () => {
    // Arrange
    const text = porcelain(MAIN, ['worktree D:/wt/detached', 'HEAD 2', 'detached'])

    // Act / Assert
    expect(parseWorktrees(text)[1]).toEqual({ path: 'D:/wt/detached', branch: null, isMain: false })
  })

  test('a bare repository is left out, and the worktrees after it are not the main checkout', () => {
    // Arrange
    const text = porcelain(['worktree /srv/repo.git', 'bare'], ['worktree /srv/wt/a', 'HEAD 1', 'branch refs/heads/a'])

    // Act / Assert
    expect(parseWorktrees(text)).toEqual([{ path: '/srv/wt/a', branch: 'a', isMain: false }])
  })

  test('no output is no worktrees', () => {
    expect(parseWorktrees('')).toEqual([])
  })
})

describe('sessionBranchesOf', () => {
  const worktrees = [
    { path: 'D:/ClaudeMods', branch: 'master', isMain: true },
    { path: 'D:/wt/feature', branch: 'feature', isMain: false },
    { path: 'D:/wt/detached', branch: null, isMain: false },
    { path: 'D:/wt/topic', branch: 'topic', isMain: false },
  ]

  test("a session in a linked worktree lists its own branch, then the other linked branches, never the main checkout or a detached one", () => {
    expect(sessionBranchesOf(worktrees, { path: 'D:/wt/feature', branch: 'feature' })).toEqual([
      { branch: 'feature', path: 'D:/wt/feature' },
      { branch: 'topic', path: 'D:/wt/topic' },
    ])
  })

  test('a session in the main checkout lists its branch and every linked branch', () => {
    expect(sessionBranchesOf(worktrees, { path: 'D:/ClaudeMods', branch: 'master' })).toEqual([
      { branch: 'master', path: 'D:/ClaudeMods' },
      { branch: 'feature', path: 'D:/wt/feature' },
      { branch: 'topic', path: 'D:/wt/topic' },
    ])
  })

  test('a detached session has no branch of its own', () => {
    expect(sessionBranchesOf(worktrees, { path: 'D:/wt/detached', branch: null })).toEqual([
      { branch: 'feature', path: 'D:/wt/feature' },
      { branch: 'topic', path: 'D:/wt/topic' },
    ])
  })

  test('the session path matches whatever the slashes and case, and a branch is listed once', () => {
    expect(sessionBranchesOf(worktrees, { path: 'd:\\wt\\feature', branch: 'feature' })).toEqual([
      { branch: 'feature', path: 'd:\\wt\\feature' },
      { branch: 'topic', path: 'D:/wt/topic' },
    ])
  })

  test('a session with no known path keeps its branch with a null path, and does not list it twice', () => {
    expect(sessionBranchesOf(worktrees, { path: null, branch: 'feature' })).toEqual([
      { branch: 'feature', path: null },
      { branch: 'topic', path: 'D:/wt/topic' },
    ])
  })
})

describe('listWorktrees', () => {
  test('reads the porcelain list through the port', async () => {
    // Arrange
    const calls: string[][] = []
    const port: Port = {
      run: async argv => {
        calls.push([...argv])
        return { exitCode: 0, stdout: porcelain(MAIN), stderr: '' }
      },
      now: async () => 0,
    }

    // Act
    const worktrees = await listWorktrees(port)

    // Assert
    expect(calls).toEqual([['git', 'worktree', 'list', '--porcelain']])
    expect(worktrees).toEqual([{ path: 'D:/ClaudeMods', branch: 'master', isMain: true }])
  })

  test('a failed or unrunnable call is unknown', async () => {
    // Arrange
    const failed: Port = { run: async () => ({ exitCode: 128, stdout: '', stderr: 'fatal' }), now: async () => 0 }
    const thrown: Port = {
      run: async () => {
        throw new Error('spawn ENOENT')
      },
      now: async () => 0,
    }

    // Act / Assert
    expect(await listWorktrees(failed)).toBeUndefined()
    expect(await listWorktrees(thrown)).toBeUndefined()
  })
})
