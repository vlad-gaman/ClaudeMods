import { continuePrompt, handoffPaths } from './document'

// Where a handoff goes and what is written there, in write order: the
// document first, then the prompt. `view` is what the panel records about it.
export const savePlan = (dir: string, now: number, sessionId: string, cwd: string, doc: string) => {
  const { path, promptPath } = handoffPaths(dir, now, sessionId)
  const prompt = continuePrompt(path, cwd)
  return {
    path,
    promptPath,
    prompt,
    writes: [
      { path, text: doc },
      { path: promptPath, text: prompt },
    ],
    view: { path, promptPath, prompt, cwd },
  }
}
