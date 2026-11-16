# PROTOTYPE 06: interrogation flow transcript (throwaway, wipe me)

Question: what does detect, questions, structured prompt, "go" feel like on a real messy dump? Scripted by hand, not run on the engine. Reacting to tone, count and layout is the point. Decisions in tickets 03, 04 and 05 are applied: banner at 200 words, one question at a time, conflicts first, recommended option first, Assumptions and Decisions sections, typed "go".

## 1. The dump (the user types this and presses Enter)

> ok so the dashboard needs a csv export, users keep asking for it. it should export everything, like all the orders, the whole table, because finance wants to reconcile against the full month and they get annoyed when stuff is missing. but also it should only export what is currently filtered on screen, that's what support actually uses it for, they filter by customer and then send the csv to the customer. performance matters, some accounts have like 300k orders so it can't freeze the page, probably do it on the server and stream it. i'd rather not add any new dependencies, the bundle is already huge, but there's that csv library papaparse that's already in the repo for the import screen so maybe use that, or whatever is easiest. the button goes in the toolbar next to the filters. oh and there is already an exports folder where the nightly report goes, i think it's called orders.csv, don't want to break that. dates should look normal for people, not iso. i also want a test or two. if it fails halfway the user should know. keep the code style the same as the rest of the orders module, i hate it when things get reformatted.

(About 215 words: over `minWords` = 200.)

## 2. Banner (shown above the prompt box before sending)

```
Long draft (215 words). Turn it into one clear prompt?
[ Structure ]   [ Ignore ]
```

User picks **Structure**. The draft is saved to `$.store`; the prompt box is cleared.

## 3. Detection pass (internal, not shown)

Points extracted, then compared by subject:

| Subject | Point | Finding |
|---|---|---|
| export scope | "everything, the whole table" | conflict with next |
| export scope | "only what is currently filtered" | conflict with previous |
| dependencies | "no new dependencies" vs "use papaparse (already in repo)" | not a conflict: papaparse is not new; becomes an assumption |
| server vs client | "on the server and stream it" | fine |
| existing file | "don't break orders.csv" | gap, costly: does the export write to that folder or only download? |
| date format | "normal for people" | ambiguity, low stakes: assume locale format |
| tests | "a test or two" | fine |

Result: 1 conflict, 1 costly gap, 2 low-stakes assumptions. 2 questions needed.

## 4. Interrogation (one question at a time, conflict first)

```
Question 1 of 2
You asked for both the whole table and only what is filtered on screen.
Which should the button export?

  1. The filtered rows, with a separate "Export all" choice for finance  (recommended)
  2. Only the filtered rows (no "all" option)
  3. Always the whole table, ignoring filters
  Or type your own answer. Type "enough" to stop and use assumptions.
```

User: `1`

```
Question 2 of 2
The nightly report already writes orders.csv into the exports folder.
Should the new export write files there, or only download to the browser?

  1. Download only, never touch the exports folder  (recommended)
  2. Also save a copy in the exports folder under a different name
  Or type your own answer.
```

User: `1`

Re-check of touched points finds no new conflict. Interrogation ends after 2 of a possible 8 questions.

## 5. Structured prompt (placed in the prompt box, editable)

```
Add a CSV export to the orders dashboard.

Goal
Let users download orders as CSV. Support exports the filtered view to send to customers; finance exports the full month.

Context
- Some accounts have about 300k orders, so the page must not freeze.
- The import screen already uses papaparse.
- A nightly report already writes orders.csv to the exports folder.

Task
- Add an "Export" button to the toolbar next to the filters, with a second "Export all" choice.
- Generate the CSV on the server and stream it to the browser.
- Report a failure to the user if the export fails partway.

Constraints
- Do not add dependencies; reuse papaparse.
- Never read or write the exports folder or orders.csv.
- Keep the orders module's existing code style; do not reformat other code.

Done when
- Filtered and full exports both download correctly, including on a 300k-order account.
- A mid-stream failure shows an error to the user.
- One or two tests cover the export.

Decisions
- Filtered export by default, with a separate "Export all", over a single mode (you said both; you chose this).
- Download only, not saved in the exports folder, over also saving a copy (you chose this).

Assumptions (edit or veto before "go")
- Dates shown in the user's locale format, not ISO.
- papaparse counts as "no new dependency" because it is already in the repo.
- Encoding is UTF-8 with a header row.

Type "go" to run this, edit the text first, or "cancel" to get your original dump back.
```

## 6. User types `go`

The prompt is submitted as written. The dump stays in `$.store` until it expires.

## What to react to

- Questions: 2 asked, plain wording, never the word "conflict" or "contradiction". Is that the right tone? Would you want to see what the mod assumed *before* question 1?
- Count: the cap is 8. Here only 2 were needed; 3 to 4 might already feel heavy.
- Layout: numbered options with "(recommended)" first, plus "Or type your own answer". OK, or too much?
- Final prompt: the Assumptions and Decisions sections at the bottom, and the closing "Type go" line inside the prompt box (it must be stripped before the prompt is sent). Does the length feel right compared with the 215-word dump?
- Open concern: papaparse was resolved as an assumption, not a question. That is judgement the detector must get right.
