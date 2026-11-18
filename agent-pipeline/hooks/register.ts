import type { EngineInterface, Register } from 'claude-code'
import { shellRefusal } from './shell-refusal'

const run = { plugin: 'agent-pipeline', key: 'run' } as const

const TEST_PATH = /(^|\/)(test|[^/]*\.test|[^/]*tests|__tests__|__mocks__)\/|\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$|\.tftest\.hcl$/i
const TEST_SCRIPTS = /^d:\/testscripts\//i
const ATLASSIAN_WRITE = /^mcp__.+__(createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue|addOrEditJiraIssueComment|addWorklogToJiraIssue|createIssueLink|createConfluence\w*|updateConfluence\w*|createCompass\w*|executeWrite|executeDestructive)$/

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
    const reason = shellRefusal(command, { who: 'Vlad', agent: !!(await roleOf($, e.agentId)) })
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agent-pipeline: its shell guard failed.' }))
}
