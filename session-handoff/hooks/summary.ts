// The reply the model gave, as the parts the handoff reads. `text` is only
// there when `isAnswered` is true.
type Reply = { isAnswered: boolean; text?: string } | null | undefined

// The model's summary, trimmed, or null when it did not answer or answered blank.
export const summaryText = (reply: Reply) => {
  const text = reply?.isAnswered ? reply.text?.trim() : undefined
  return text ? text : null
}

// The detail of the write step: whether the summary came from the model.
export const summaryDetail = (reply: Reply) =>
  reply?.isAnswered ? 'summary by the model' : 'summary from last requests'

// The reply, or null when the deadline comes first or the model call fails.
// On a tie the reply is listed first and wins.
export const raceSummary = <T>(reply: Promise<T>, deadline: Promise<null>) =>
  Promise.race([reply, deadline]).catch(() => null)
