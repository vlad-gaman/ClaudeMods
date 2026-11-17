/** One failed `gh` or `az` call, as the CLI errors card lists it. The command and message are redacted before they are stored. */
export type CliFailure = { command: string; exitCode: number | null; isTimeout: boolean; at: number; message: string }

/** The newest failures kept; an older one drops off when a new one comes in. */
export const CLI_LOG_CAP = 20

const CLI_TOOLS = ['gh', 'az']
const NONE_FOUND = /no pull requests found/i
const TIMEOUT = /time(?:d)? ?out|ETIMEDOUT/i

// Secrets that can show up in a command or in CLI output: URL credentials, Authorization headers, token-like
// key=value pairs and flags, and GitHub tokens. Azure DevOps PATs have no fixed shape, so they are not caught here.
const SECRETS: [RegExp, string][] = [
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@'],
  [/(authorization:\s*)(?:(?:basic|bearer|token)\s+)?\S+/gi, '$1***'],
  [/((?:token|password|pass|pat|secret|access_token|private_token)=)[^\s&"']+/gi, '$1***'],
  [/(--?(?:token|password|pat)\s+)\S+/gi, '$1***'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, '***'],
]

export function redact(text: string) {
  return SECRETS.reduce((kept, [pattern, replacement]) => kept.replace(pattern, replacement), text)
}

const firstLine = (text: string) =>
  redact(
    text
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line !== '') ?? '',
  ).slice(0, 200)

const commandOf = (argv: readonly string[]) => redact(argv.join(' '))
const isCliCall = (argv: readonly string[]) => CLI_TOOLS.includes(argv[0] ?? '')

/** The failure a finished call is, or null: a success, a call that is not gh or az, and "no pull requests found" are not failures. */
export function failureOf(argv: readonly string[], result: { exitCode: number; stderr: string }, at: number): CliFailure | null {
  if (!isCliCall(argv) || result.exitCode === 0 || NONE_FOUND.test(result.stderr)) return null
  return {
    command: commandOf(argv),
    exitCode: result.exitCode,
    isTimeout: false,
    at,
    message: firstLine(result.stderr) || `exited ${result.exitCode}`,
  }
}

/** The failure a call that threw is (it timed out or could not run), or null for a call that is not gh or az. */
export function thrownFailureOf(argv: readonly string[], error: unknown, at: number): CliFailure | null {
  if (!isCliCall(argv)) return null
  const message = redact(error instanceof Error ? error.message : String(error))
  return { command: commandOf(argv), exitCode: null, isTimeout: TIMEOUT.test(message), at, message: firstLine(message) }
}

/** The log with a new failure added, keeping the newest `CLI_LOG_CAP`. */
export const withFailure = (log: CliFailure[], failure: CliFailure) => [...log, failure].slice(-CLI_LOG_CAP)
