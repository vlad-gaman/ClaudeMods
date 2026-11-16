import { expect, test } from 'claude-code/testing'

import { CACHE_TTL_MIN, RUN_BEFORE_COLD_MIN, cacheWaitMs } from '../hooks/data'
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

test('the cache handoff waits the cache lifetime minus the lead, for any lifetime', () => {
  expect(cacheWaitMs(60, 5)).toBe(55 * 60000)
  expect(cacheWaitMs(90, 5)).toBe(85 * 60000)
  expect(cacheWaitMs(10, 5)).toBe(5 * 60000)
  expect(cacheWaitMs(5, 5)).toBe(60000)
  expect(cacheWaitMs(CACHE_TTL_MIN, RUN_BEFORE_COLD_MIN)).toBe(55 * 60000)
})
