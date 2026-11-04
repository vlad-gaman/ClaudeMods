import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const TURN = {
  answer: 'ok',
  text: 'ok',
  usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 900, output_tokens: 50 },
} as never

test('the chat count adds up over turns and starts over when the session restarts', async ($, on) => {
  let startedAt = 1
  mock.clock(on)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.usage', () => ({
    value: { context: { tokens: 10, window: 100, percent: 10 }, rateLimits: [], startedAt },
  }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('turn.complete', ($, e) => ({ text: 'ok', usage: e.usage }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '.' } as never)

  const shown = async () => {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
    const text = await ui.find({ type: 'Text', text: /↑/ })
    await ui.unmount()

    return text
  }

  await $.turn.complete(TURN)
  expect(await shown()).toMatchObject({ text: 'Session ↑1k ↓50' })
  await $.turn.complete(TURN)
  expect(await shown()).toMatchObject({ text: 'Session ↑2k ↓100' })
  startedAt = 2
  await $.turn.complete(TURN)
  expect(await shown()).toMatchObject({ text: 'Session ↑1k ↓50' })
})
