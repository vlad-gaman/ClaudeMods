import { CONTEXT_REARM, CONTEXT_THRESHOLD } from './data'

// The context trigger after a turn: fires once when the context passes the
// threshold, then waits until the context has fallen back below
// `CONTEXT_REARM` of it.
export const contextTrigger = (isArmed: boolean, tokens: number, threshold = CONTEXT_THRESHOLD) => {
  const armed = isArmed || tokens < threshold * CONTEXT_REARM
  const isFired = armed && tokens > threshold
  return { isFired, isArmed: armed && !isFired }
}
