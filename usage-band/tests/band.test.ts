import { expect, mock, test } from 'claude-code/testing'

import { severity } from '../hooks/figures'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const MEASURE = {
  context: { tokens: 84000, window: 200000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.5 },
    { kind: 'seven_day', percentUsed: 91 },
  ],
  cost: { usd: 3.4 },
  changed: ['context', 'rateLimits', 'cost'],
} as const

test('the band shows chat, session and week usage on every surface', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  mock.clock(on)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.usage', () => ({
    value: { context: MEASURE.context, rateLimits: [...MEASURE.rateLimits], cost: MEASURE.cost, startedAt: 1 },
  }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', children: ['engine'] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  await $.session.measure({ ...MEASURE, rateLimits: [...MEASURE.rateLimits], changed: [...MEASURE.changed] })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toMatchObject({ props: { color: 'error' } })
    expect(await ui.find({ type: 'Text', text: /84k\/200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^23\.5%$/ })).toMatchObject({ props: { color: 'success' } })
    expect(await ui.find({ type: 'Text', text: /^91%$/ })).toMatchObject({ props: { color: 'error' } })
    expect(await ui.find({ type: 'Text', text: /\$3\.40/ })).toBeDefined()
    await ui.press({ key: 'hide' })
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    await ui.unmount()
    expect(await $.command.run({ command: 'usage-band', args: '' } as never)).toMatchObject({ text: 'Usage band shown.' })
  }
})

test('limits go yellow at 75% and red past 90%; the chat at 25% and past 40%', () => {
  expect([74.9, 75, 90, 90.1].map(p => severity(p, 75, 90))).toEqual(['success', 'warning', 'warning', 'error'])
  expect([24, 25, 40, 41].map(p => severity(p, 25, 40))).toEqual(['success', 'warning', 'warning', 'error'])
})
