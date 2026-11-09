import { expect, test } from 'claude-code/testing'

const stub = (on: any, commands: string[], opened: string[]) => {
  const kept: Record<string, unknown> = {}
  on('store.get', (_: any, e: any) => ({ value: kept[e.key] }))
  on('store.set', (_: any, e: any) => {
    kept[e.key] = e.value

    return { value: undefined }
  })
  on('command.register', (_: any, e: any) => {
    commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('ui.open', (_: any, e: any) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('process.run', (_: any, e: any) => {
    const stdout = e.argv[2] === 'list' ? '[]' : ''

    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
}

test('starting a session registers the switchboard command and does not open the pane', async ($, on) => {
  const commands: string[] = []
  const opened: string[] = []
  stub(on, commands, opened)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(commands).toContain('switchboard')
  expect(opened).toEqual([])
})
