export const VERIFY_FAILED = 'the saved file does not match what was written'

export type Verdict =
  | { isOk: true; characters: number }
  | { isOk: false; reason: 'doc-unreadable' | 'doc-length' | 'doc-section' | 'prompt-unreadable' | 'prompt-differs'; message: string }

// Reads back the two files and checks them against what was written. Only the
// first reason that fails is given.
export const verifySaved = (
  saved: { doc: unknown; prompt: unknown },
  expected: { doc: string; prompt: string },
): Verdict => {
  const fail = (reason: Exclude<Verdict, { isOk: true }>['reason']): Verdict => ({
    isOk: false,
    reason,
    message: VERIFY_FAILED,
  })
  if (typeof saved.doc !== 'string') return fail('doc-unreadable')
  if (saved.doc.length !== expected.doc.length) return fail('doc-length')
  if (!saved.doc.includes('## Recent user requests')) return fail('doc-section')
  if (typeof saved.prompt !== 'string') return fail('prompt-unreadable')
  if (saved.prompt !== expected.prompt) return fail('prompt-differs')
  return { isOk: true, characters: saved.doc.length }
}
