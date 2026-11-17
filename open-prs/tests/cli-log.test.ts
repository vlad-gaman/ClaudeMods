import { describe, expect, test } from 'claude-code/testing'

import { CLI_LOG_CAP, type CliFailure, failureOf, redact, thrownFailureOf, withFailure } from '../hooks/cli-log'

const NOW = 1_700_000_000_000

describe('failureOf', () => {
  test('a failed gh or az call is logged with its command, exit code and first line of stderr', () => {
    // Arrange
    const argv = ['gh', 'pr', 'list', '-R', 'esendex/api']

    // Act
    const failure = failureOf(argv, { exitCode: 1, stderr: 'HTTP 502: Bad Gateway\nmore detail' }, NOW)

    // Assert
    expect(failure).toEqual({ command: 'gh pr list -R esendex/api', exitCode: 1, isTimeout: false, at: NOW, message: 'HTTP 502: Bad Gateway' })
  })

  test('a success is not logged', () => {
    expect(failureOf(['gh', 'pr', 'list'], { exitCode: 0, stderr: '' }, NOW)).toBeNull()
  })

  test('"no pull requests found" is not an error', () => {
    expect(failureOf(['gh', 'pr', 'view'], { exitCode: 1, stderr: 'no pull requests found for branch "main"' }, NOW)).toBeNull()
  })

  test('a git call is not a CLI call of the pane', () => {
    expect(failureOf(['git', 'branch', '--show-current'], { exitCode: 128, stderr: 'fatal' }, NOW)).toBeNull()
  })

  test('a call with no stderr says the exit code', () => {
    expect(failureOf(['az', 'repos', 'pr', 'list'], { exitCode: 2, stderr: '' }, NOW)?.message).toBe('exited 2')
  })
})

describe('thrownFailureOf', () => {
  test('a call that times out is logged as a timeout with no exit code', () => {
    // Arrange
    const error = new Error('process timed out after 60000 ms')

    // Act
    const failure = thrownFailureOf(['az', 'repos', 'pr', 'list'], error, NOW)

    // Assert
    expect(failure).toEqual({ command: 'az repos pr list', exitCode: null, isTimeout: true, at: NOW, message: 'process timed out after 60000 ms' })
  })

  test('a call that cannot run is logged with its message', () => {
    expect(thrownFailureOf(['gh', 'pr', 'list'], new Error('spawn gh ENOENT'), NOW)).toEqual({
      command: 'gh pr list',
      exitCode: null,
      isTimeout: false,
      at: NOW,
      message: 'spawn gh ENOENT',
    })
  })

  test('a git call that throws is not logged', () => {
    expect(thrownFailureOf(['git', 'status'], new Error('spawn git ENOENT'), NOW)).toBeNull()
  })
})

describe('redact', () => {
  test('a token in argv is removed', () => {
    const argv = ['gh', 'api', '-H', 'Authorization: token ghp_abcdefghijklmnopqrstuvwxyz0123456789']

    expect(redact(argv.join(' '))).toBe('gh api -H Authorization: ***')
  })

  test('credentials in a URL are removed, in argv and in stderr', () => {
    expect(redact('git clone https://user:s3cret@dev.azure.com/o/p/_git/r')).toBe('git clone https://***@dev.azure.com/o/p/_git/r')
    expect(redact('remote: fatal: https://x-access-token:ghs_abc@github.com/o/r unreachable')).toBe('remote: fatal: https://***@github.com/o/r unreachable')
  })

  test('a token= or password= value is removed, and a flag value too', () => {
    expect(redact('GET /x?token=abc123&page=2 failed')).toBe('GET /x?token=***&page=2 failed')
    expect(redact('az devops invoke --password hunter2 --area git')).toBe('az devops invoke --password *** --area git')
  })

  test('a GitHub token is removed wherever it appears', () => {
    expect(redact('auth failed for github_pat_11ABCDEFG0123456789_abcdefghijklmnop')).toBe('auth failed for ***')
  })

  test('text with nothing to hide is kept', () => {
    expect(redact('HTTP 502: Bad Gateway')).toBe('HTTP 502: Bad Gateway')
  })
})

describe('withFailure', () => {
  const entry = (n: number): CliFailure => ({ command: `gh ${n}`, exitCode: 1, isTimeout: false, at: n, message: 'x' })

  test('keeps the newest entries, at most the cap', () => {
    // Arrange
    let log: CliFailure[] = []

    // Act
    for (let n = 1; n <= CLI_LOG_CAP + 1; n++) log = withFailure(log, entry(n))

    // Assert
    expect(CLI_LOG_CAP).toBe(20)
    expect(log).toHaveLength(CLI_LOG_CAP)
    expect(log[0]?.at).toBe(2)
    expect(log.at(-1)?.at).toBe(CLI_LOG_CAP + 1)
  })
})
