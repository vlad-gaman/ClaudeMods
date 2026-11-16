import type { EngineInterface, Register } from 'claude-code'

const run = { plugin: 'agent-pipeline', key: 'run' } as const

const TEST_PATH = /(^|\/)(test|[^/]*\.test|[^/]*tests|__tests__|__mocks__)\/|\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$|\.tftest\.hcl$/i
const TEST_SCRIPTS = /^d:\/testscripts\//i
const ATLASSIAN_WRITE = /^mcp__.+__(createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue|addOrEditJiraIssueComment|addWorklogToJiraIssue|createIssueLink|createConfluence\w*|updateConfluence\w*|createCompass\w*|executeWrite|executeDestructive)$/
const AZ = /^(?:.*[\\/])?az(?:\.cmd|\.exe)?$/i
const AZ_WRITE = new Set(['create', 'add', 'delete', 'update', 'remove', 'purge', 'set', 'assign', 'deploy', 'start', 'stop', 'restart', 'swap', 'scale', 'upgrade', 'import', 'regenerate', 'reset'])
const AZ_LOCAL = new Set(['account set', 'config set'])
const SHELL = /^(?:.*[\\/])?(?:bash|sh|zsh|pwsh|powershell|cmd)(?:\.exe)?$/i
const SHELL_COMMAND = /^(?:-c|-command|\/c|\/k)$/i
const TERRAFORM = /^(?:.*[\\/])?terraform(?:\.exe)?$/i
const TERRAFORM_LOCAL = new Set(['fmt', 'validate', 'providers', 'version'])
const PUBLISH = /^(?:.*[\\/])?(npm|pnpm|yarn|mvn|mvnw|dotnet|nuget)(?:\.cmd|\.exe)?$/i
const MVN_DEPLOY = /^(?:deploy(?::.*)?|release:.*|.*:deploy)$/

type Role = 'implementer' | 'tester' | 'documenter' | 'reviewer'

function normalize(path: string) {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}

async function roleOf($: EngineInterface, agentId: string | undefined): Promise<Role | undefined> {
  if (agentId === undefined) return undefined
  const agent = (await $.agent.list()).find(a => a.id === agentId)
  return /^(?:agent-pipeline:)?(implementer|tester|documenter|reviewer)$/.exec(agent?.type ?? '')?.[1] as Role | undefined
}

async function tempRoots($: EngineInterface) {
  const [temp, local] = await Promise.all([$.env.get('TEMP'), $.env.get('LOCALAPPDATA')])
  return [temp, local && `${local}/Temp`].filter((root): root is string => !!root).map(root => `${normalize(root).toLowerCase()}/`)
}

async function refusal($: EngineInterface, role: Role, rawPath: string) {
  const path = normalize(rawPath)
  const isTest = TEST_PATH.test(path)
  if (role !== 'tester') return isTest ? `agent-pipeline: the ${role} never edits test paths (${rawPath}).` : undefined
  if (isTest || TEST_SCRIPTS.test(path)) return undefined
  const lower = path.toLowerCase()
  if ((await tempRoots($)).some(root => lower.startsWith(root))) return undefined
  return `agent-pipeline: the tester edits only test paths, D:\\TestScripts\\ and $TEMP (${rawPath}).`
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

function azRefusal(words: string[]) {
  if (!AZ.test(words[0])) return undefined
  const flag = words.findIndex((word, i) => i > 0 && word.startsWith('-'))
  const verbs = words.slice(1, flag < 0 ? undefined : flag)
  const path = verbs.join(' ').toLowerCase()
  if (AZ_LOCAL.has(path) || (path === 'repos pr create' && flag > 0 && isDraft(words.slice(flag)))) return undefined
  if (verbs.some(verb => AZ_WRITE.has(verb.toLowerCase()))) return `agent-pipeline: \`az ${verbs.join(' ')}\` changes Azure resources; ask Vlad to run it.`
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'pipeline_begin',
      description: 'Marks the start of an agent-pipeline run in this session. While it is set, Jira and Confluence write tools are refused.',
      inputSchema: { type: 'object', properties: { ticket: { type: 'string', description: 'The ticket NN-slug, Jira key, or "free text".' } }, required: ['ticket'] },
    })
    await $.tool.register({ name: 'pipeline_end', description: 'Marks the end of the agent-pipeline run in this session, lifting the Jira and Confluence write block.' })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__agent-pipeline__pipeline_begin' }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: 'agent-pipeline: only the main conversation starts a run.' }
    const ticket = typeof e.ticket === 'string' && e.ticket.trim() ? e.ticket.trim() : 'free text'
    await $.state.set(run, { ticket, startedAt: await $.clock.now() })
    return { result: `Run flag set for ${ticket}. Jira and Confluence writes are refused until pipeline_end.` }
  })

  on('tool.call', { tool: 'mcp__agent-pipeline__pipeline_end' }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: 'agent-pipeline: only the main conversation ends a run.' }
    await $.state.set(run, null)
    return { result: 'Run flag cleared.' }
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const role = await roleOf($, e.agentId)
    const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : undefined
    const reason = role && path !== undefined ? await refusal($, role, path) : undefined
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agent-pipeline: its edit guard failed.' }))

  on('tool.call', { tool: ATLASSIAN_WRITE }, async ($, e, next) => {
    const { value } = await $.state.get(run)
    return value ? { deny: `agent-pipeline: Jira and Confluence are read-only during the pipeline run for ${value.ticket}.` } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agent-pipeline: its Jira guard failed.' }))

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const command = e.tool === 'Bash' || e.tool === 'PowerShell' ? e.command : undefined
    if (command === undefined) return next(e)
    const reason = refuseAny(command, azRefusal) ?? ((await roleOf($, e.agentId)) ? refuseAny(command, agentRefusal) : undefined)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agent-pipeline: its shell guard failed.' }))
}
