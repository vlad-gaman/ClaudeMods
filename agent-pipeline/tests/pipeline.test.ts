import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const AGENTS = [
  { id: 'impl', type: 'agent-pipeline:implementer', description: 'implement', status: 'running' },
  { id: 'test', type: 'agent-pipeline:tester', description: 'tests', status: 'running' },
  { id: 'docs', type: 'agent-pipeline:documenter', description: 'docs', status: 'running' },
  { id: 'rev', type: 'agent-pipeline:reviewer', description: 'review', status: 'running' },
  { id: 'other', type: 'general-purpose', description: 'other', status: 'running' },
]

const JIRA_EDIT = 'mcp__3cf54655-b659-4537-88ad-e00e3cd32202__editJiraIssue'
const JIRA_READ = 'mcp__3cf54655-b659-4537-88ad-e00e3cd32202__getJiraIssue'
const ROVO_WRITE = 'mcp__a61d0d65-3e60-4bd4-8112-ec22f7262e90__executeWrite'

function engine(on: On) {
  mock.env(on, { TEMP: 'C:\\Users\\VLAD~1.GAM\\AppData\\Local\\Temp', LOCALAPPDATA: 'C:\\Users\\vlad.gaman\\AppData\\Local' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_000 }))
  on('agent.list', () => ({ value: AGENTS }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__agent-pipeline__${e.name}` } }))
  on('tool.call', () => ({ result: 'ran' }))
}

test('the implementer and documenter are refused test paths only', async ($, on) => {
  // Arrange
  engine(on)
  const edit = (agentId: string, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId })

  // Act
  const results = await Promise.all([
    edit('impl', 'D:\\Github\\Repo\\tests\\Foo.Tests\\FooTests.cs'),
    edit('impl', 'D:\\Github\\Repo\\src\\Foo.UnitTests\\FooTests.cs'),
    edit('docs', 'D:/Github/Repo/test/Bar.cs'),
    edit('impl', 'D:\\Github\\Repo\\src\\Foo\\Foo.cs'),
    edit('docs', 'D:\\Github\\Repo\\src\\Foo\\Foo.cs'),
  ])

  // Assert
  expect(results.map(r => r.deny === undefined)).toEqual([false, false, false, true, true])
})

test('the tester is refused everything but test paths, TestScripts and TEMP', async ($, on) => {
  // Arrange
  engine(on)
  const edit = (file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', agentId: 'test' })

  // Act
  const results = await Promise.all([
    edit('D:\\Github\\Repo\\src\\Foo.Tests\\FooTests.cs'),
    edit('D:\\TestScripts\\Repo\\CO-1\\run.ps1'),
    edit('C:\\Users\\VLAD~1.GAM\\AppData\\Local\\Temp\\scratch.txt'),
    edit('C:\\Users\\vlad.gaman\\AppData\\Local\\Temp\\scratch.txt'),
    edit('D:\\Github\\Repo\\src\\Foo\\Foo.cs'),
    edit('D:\\TestScripts\\..\\Github\\Repo\\src\\Foo.cs'),
    edit('D:\\Github\\Repo\\appsettings.json'),
  ])

  // Assert
  expect(results.map(r => r.deny === undefined)).toEqual([true, true, true, true, false, false, false])
})

test('test files of every profile are test paths', async ($, on) => {
  // Arrange
  engine(on)
  const edit = (agentId: string, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId })
  const testFiles = [
    'D:\\Github\\Repo\\ui\\app\\src\\app\\foo.component.spec.ts',
    'D:\\GithubPrivate\\dash\\src\\App.test.tsx',
    'D:\\GithubPrivate\\dash\\src\\__tests__\\App.tsx',
    'D:\\Github\\Billing\\src\\test\\java\\com\\x\\FooTest.java',
    'D:\\AzureDevops\\Prov\\terraform\\main.tftest.hcl',
    'D:\\Github\\Repo\\ui\\app\\e2e\\login.e2e-spec.ts',
    'D:\\GithubPrivate\\dash\\src\\__mocks__\\api.ts',
    'D:\\Github\\Repo\\src\\Foo.Test\\FooTest.cs',
  ]
  const productionFiles = [
    'D:\\Github\\Repo\\ui\\app\\src\\app\\foo.component.ts',
    'D:\\Github\\Repo\\ui\\app\\src\\app\\contest.service.ts',
    'D:\\AzureDevops\\Prov\\terraform\\main.tf',
  ]

  // Act
  const implementer = await Promise.all([...testFiles, ...productionFiles].map(f => edit('impl', f)))
  const tester = await Promise.all([...testFiles, ...productionFiles].map(f => edit('test', f)))

  // Assert
  expect(implementer.map(r => r.deny === undefined)).toEqual([...testFiles.map(() => false), ...productionFiles.map(() => true)])
  expect(tester.map(r => r.deny === undefined)).toEqual([...testFiles.map(() => true), ...productionFiles.map(() => false)])
})

test('the main loop and other agents pass the edit guard', async ($, on) => {
  // Arrange
  engine(on)

  // Act
  const main = await $.tool.call({ tool: 'Write', file_path: 'D:\\Github\\Repo\\tests\\A.cs', content: 'x' })
  const other = await $.tool.call({ tool: 'Write', file_path: 'D:\\Github\\Repo\\tests\\A.cs', content: 'x', agentId: 'other' })

  // Assert
  expect(main.deny).toBeUndefined()
  expect(other.deny).toBeUndefined()
})

test('Atlassian writes are refused only between pipeline_begin and pipeline_end', async ($, on) => {
  // Arrange
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Act
  const before = await $.tool.call({ tool: JIRA_EDIT, issueIdOrKey: 'CO-1' })
  const begun = await $.tool.call({ tool: 'mcp__agent-pipeline__pipeline_begin', ticket: 'CO-1' })
  const during = await Promise.all([JIRA_EDIT, ROVO_WRITE, JIRA_READ].map(tool => $.tool.call({ tool, issueIdOrKey: 'CO-1' })))
  const ended = await $.tool.call({ tool: 'mcp__agent-pipeline__pipeline_end' })
  const after = await $.tool.call({ tool: JIRA_EDIT, issueIdOrKey: 'CO-1' })

  // Assert
  expect(before.deny).toBeUndefined()
  expect(begun.deny).toBeUndefined()
  expect(during.map(r => r.deny === undefined)).toEqual([false, false, true])
  expect(ended.deny).toBeUndefined()
  expect(after.deny).toBeUndefined()
})

test('a subagent cannot clear the run flag', async ($, on) => {
  // Arrange
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__agent-pipeline__pipeline_begin', ticket: 'CO-1' })

  // Act
  const ended = await $.tool.call({ tool: 'mcp__agent-pipeline__pipeline_end', agentId: 'impl' })
  const write = await $.tool.call({ tool: JIRA_EDIT, issueIdOrKey: 'CO-1' })

  // Assert
  expect(ended.deny).toBeDefined()
  expect(write.deny).toBeDefined()
})

test('the shell guard refuses az writes to the main loop and agents, and terraform and publishing to agents only', async ($, on) => {
  // Arrange
  engine(on)
  const bash = (command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, agentId })

  // Act
  const results = await Promise.all([
    bash('az group delete -n x --yes'),
    bash('az --debug repos pr create --title x', 'impl'),
    bash('terraform plan', 'impl'),
    bash('npm publish', 'docs'),
    bash('az group list -o table'),
    bash('terraform plan'),
    bash('terraform plan', 'other'),
  ])

  // Assert
  expect(results.map(r => r.deny === undefined)).toEqual([false, false, false, false, true, true, true])
})

test('the az guard covers the PowerShell tool', async ($, on) => {
  // Arrange
  engine(on)
  const ps = (command: string) => $.tool.call({ tool: 'PowerShell', command })

  // Act
  const chained = await ps('Set-Location D:\\Github; az group delete -n x')
  const called = await ps('& "C:\\Program Files\\Azure\\az.cmd" group delete -n x')
  const readOnly = await ps('az version --query "fix the update path"')

  // Assert
  expect(chained.deny).toBeDefined()
  expect(called.deny).toBeDefined()
  expect(readOnly.deny).toBeUndefined()
})
