import { CONTEXT_REARM, CONTEXT_THRESHOLD } from './data'

// The context trigger after a turn: fires once when the context passes the
// threshold, then waits until the context has fallen back below
// `CONTEXT_REARM` of it.
export const contextTrigger = (isArmed: boolean, tokens: number) => {
  const armed = isArmed || tokens < CONTEXT_THRESHOLD * CONTEXT_REARM
  const isFired = armed && tokens > CONTEXT_THRESHOLD
  return { isFired, isArmed: armed && !isFired }
}
