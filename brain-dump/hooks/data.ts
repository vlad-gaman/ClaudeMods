export const DEFAULT_MIN_WORDS = 200
export const DEFAULT_MAX_QUESTIONS = 8

/** The most characters of a dump the mod will read; longer ones go through as written. */
export const MAX_DUMP_CHARS = 60000

export const MODEL = 'sonnet'
export const MODEL_TIMEOUT_MS = 90000
export const MODEL_MAX_TOKENS = 8000

export const READING = 'Reading your dump...'

const PLAIN =
  "Reply with one JSON object and nothing else. No code fences, no commentary. Use the owner's own wording where you can; never invent requirements."

export const EXTRACT_SYSTEM = `You split a long, messy prompt (a dump) into atomic points. ${PLAIN}
Shape: {"points":[{"id":"p1","subject":"what the point is about","requirement":"what is asked, in the owner's words","value":"a concrete value if one is given, else empty"}]}
One point per requirement. Points about the same thing share the same subject text.`

export const FIND_SYSTEM = `You compare the points of a dump and find what the owner must settle before the task can run. ${PLAIN}
Compare points that share a subject. Each finding has a kind:
- "conflict": two points cannot both hold.
- "ambiguity": one point with several readings that change the result.
- "gap": the task needs something the dump never says.
Set "costly" to true when a wrong guess is hard to undo (deleting or overwriting, security, data, money). A fact that is not new to the project, such as a dependency already in the repo, is not worth a question: list it as a gap with "costly": false and an assumption.
Each finding also carries the question to ask. Write the question in plain words that state both sides ("You asked for both the whole table and only what is filtered. Which should the button export?"). NEVER use the words "conflict" or "contradiction" in a question. Give 2 to 4 short option labels with the recommended option FIRST, its label ending in " (recommended)". Give a header of at most 12 characters (for example "Scope"). Give "assumption": one sentence stating what you would assume if the owner were not asked.
Shape: {"findings":[{"id":"f1","kind":"conflict","subject":"...","costly":true,"question":"...","header":"Scope","options":["A (recommended)","B"],"assumption":"..."}]}
If there is nothing to settle, return {"findings":[]}.`

export const ANSWER_SYSTEM = `The owner answered a question about their dump. Update the points to match the answer, then re-check only the points about the same subject, so a clash the answer created is caught. ${PLAIN}
Shape: {"points":[changed or new points],"removed":["ids of points the answer replaced"],"findings":[new findings, same shape as before],"resolved":["ids of findings now settled, including the one asked"]}`

export const BUILD_SYSTEM = `You write the final structured prompt from a list of points and the owner's decisions. Build it from the points, never by pasting the answers after the dump. ${PLAIN}
Shape: {"title":"one line saying what the task is","goal":["..."],"context":["..."],"task":["..."],"constraints":["..."],"doneWhen":["..."],"decisions":["X over Y (you chose this)"]}
Leave a list empty when it has nothing. "decisions" has one line per answered question.`
