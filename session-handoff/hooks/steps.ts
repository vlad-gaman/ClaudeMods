import type { HandoffStep, HandoffView } from '../types'
import { STEPS, STEP_LABELS } from './data'
import type { StepName } from './data'

// The six steps as the band shows them, all waiting.
export const stepList = (): HandoffStep[] =>
  STEPS.map(name => ({ label: STEP_LABELS[name], status: 'pending' }))

// The steps with one of them set to `status`, and its detail when given.
export const withStep = (
  steps: HandoffStep[],
  name: StepName,
  status: HandoffStep['status'],
  detail?: string,
): HandoffStep[] => steps.map((s, n) => (n === STEPS.indexOf(name) ? { ...s, status, detail } : s))

// The phase and steps after `error` stops the run at `name`.
export const failedPatch = (
  steps: HandoffStep[],
  name: StepName,
  error: unknown,
): Pick<HandoffView, 'phase' | 'steps'> => {
  const message = error instanceof Error ? error.message : String(error)
  return {
    phase: 'failed',
    steps: steps.map((s, n) => (n === STEPS.indexOf(name) ? { ...s, status: 'error', detail: message } : s)),
  }
}
