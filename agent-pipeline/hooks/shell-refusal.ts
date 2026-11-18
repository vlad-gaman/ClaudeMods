const AZ = /^(?:.*[\\/])?az(?:\.cmd|\.exe)?$/i
const AZ_WRITE = new Set(['create', 'add', 'delete', 'update', 'remove', 'purge', 'set', 'assign', 'deploy', 'start', 'stop', 'restart', 'swap', 'scale', 'upgrade', 'import', 'regenerate', 'reset'])
const AZ_LOCAL = new Set(['account set', 'config set'])
const SHELL = /^(?:.*[\\/])?(?:bash|sh|zsh|pwsh|powershell|cmd)(?:\.exe)?$/i
const SHELL_COMMAND = /^(?:-c|-command|\/c|\/k)$/i
const TERRAFORM = /^(?:.*[\\/])?terraform(?:\.exe)?$/i
const TERRAFORM_LOCAL = new Set(['fmt', 'validate', 'providers', 'version'])
const PUBLISH = /^(?:.*[\\/])?(npm|pnpm|yarn|mvn|mvnw|dotnet|nuget)(?:\.cmd|\.exe)?$/i
const MVN_DEPLOY = /^(?:deploy(?::.*)?|release:.*|.*:deploy)$/

export type ShellRefusalOptions = {
  /** The person who runs refused commands themselves; named in the refusal text. */
  who: string
  /** True for a pipeline agent: the terraform and publish rules apply as well as the az rules. */
  agent: boolean
}

function commands(line: string) {
  const out: string[][] = [[]]
  let word: string | undefined
  let quote: string | undefined
  const end = () => {
    if (word !== undefined) out[out.length - 1].push(word)
    word = undefined
  }
  for (const c of line) {
    if (quote) {
      if (c === quote) quote = undefined
      else word += c
    } else if (c === '"' || c === "'") {
      quote = c
      word ??= ''
    } else if ('\n;&|(){}`'.includes(c)) {
      end()
      out.push([])
    } else if (/\s/.test(c)) end()
    else word = (word ?? '') + c
  }
  end()
  return out.filter(words => words.length > 0)
}

function isDraft(args: string[]) {
  let draft = false
  args.forEach((arg, i) => {
    const flag = /^--draft(?:=(.*))?$/i.exec(arg)
    if (flag) draft = (flag[1] ?? args[i + 1] ?? '').toLowerCase() === 'true'
  })
  return draft
}

function refuseAny(line: string, check: (words: string[]) => string | undefined): string | undefined {
  for (const words of commands(line)) {
    if (SHELL.test(words[0])) {
      const at = words.findIndex(word => SHELL_COMMAND.test(word))
      const nested = at > 0 ? refuseAny(words.slice(at + 1).join(' '), check) : undefined
      if (nested) return nested
      continue
    }
    const reason = check(words)
    if (reason) return reason
  }
  return undefined
}

function azRefusal(words: string[], who: string) {
  if (!AZ.test(words[0])) return undefined
  // Dash-words ahead of the verbs (`az --debug repos ...`) are skipped; a value after one counts as a verb, so the guard fails closed.
  const start = words.findIndex((word, i) => i > 0 && !word.startsWith('-'))
  if (start < 0) return undefined
  const flag = words.findIndex((word, i) => i > start && word.startsWith('-'))
  const verbs = words.slice(start, flag < 0 ? undefined : flag)
  const path = verbs.join(' ').toLowerCase()
  if (AZ_LOCAL.has(path) || (path === 'repos pr create' && flag > 0 && isDraft(words.slice(flag)))) return undefined
  if (verbs.some(verb => AZ_WRITE.has(verb.toLowerCase()))) return `agent-pipeline: \`az ${verbs.join(' ')}\` changes Azure resources; ask ${who} to run it.`
  return undefined
}

function agentRefusal(words: string[]) {
  const args = words.slice(1).map(word => word.toLowerCase())
  if (TERRAFORM.test(words[0])) {
    const sub = args.find(arg => !arg.startsWith('-')) ?? ''
    if (TERRAFORM_LOCAL.has(sub) || (sub === 'init' && args.includes('-backend=false'))) return undefined
    return `agent-pipeline: pipeline agents run only terraform fmt, validate and init -backend=false; report needs-approval for \`terraform ${sub}\`.`
  }
  const tool = PUBLISH.exec(words[0])?.[1].toLowerCase()
  const publishes =
    ((tool === 'npm' || tool === 'pnpm' || tool === 'yarn') && args.includes('publish')) ||
    ((tool === 'mvn' || tool === 'mvnw') && args.some(arg => MVN_DEPLOY.test(arg))) ||
    (tool === 'dotnet' && args[0] === 'nuget' && args[1] === 'push') ||
    (tool === 'nuget' && args[0] === 'push')
  return publishes ? `agent-pipeline: pipeline agents never publish packages (\`${words.join(' ')}\`).` : undefined
}

/** Why a Bash or PowerShell command line is refused, or undefined when it may run. */
export function shellRefusal(line: string, { who, agent }: ShellRefusalOptions): string | undefined {
  return refuseAny(line, words => azRefusal(words, who)) ?? (agent ? refuseAny(line, agentRefusal) : undefined)
}
