import { expect, test } from 'claude-code/testing'

import { contextTrigger } from '../hooks/trigger'

test('fires once past 250k tokens while armed, and disarms', () => {
  expect(contextTrigger(true, 250000)).toEqual({ isFired: false, isArmed: true })
  expect(contextTrigger(true, 250001)).toEqual({ isFired: true, isArmed: false })
})

test('stays disarmed until the context falls below 200k', () => {
  expect(contextTrigger(false, 260000)).toEqual({ isFired: false, isArmed: false })
  expect(contextTrigger(false, 200000)).toEqual({ isFired: false, isArmed: false })
  expect(contextTrigger(false, 199999)).toEqual({ isFired: false, isArmed: true })
})
