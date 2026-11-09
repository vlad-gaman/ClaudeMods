import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0)
const START = { cwd: '/p', surface: 'desktop', isInteractive: true } as const

const POINTS = { points: [{ id: 'p1', subject: 'export', requirement: 'export the table', value: '' }] }
const FINDING = {
  id: 'f1',
  kind: 'conflict',
  subject: 'export',
  costly: true,
  question: 'Whole table or only filtered rows?',
  header: 'Scope',
  options: ['Filtered rows (recommended)', 'Whole table'],
  assumption: 'Filtered rows.',
}
const SECTIONS = {
  title: 'Add CSV export',
  goal: ['Export orders'],
  task: ['Add a button'],
  decisions: ['Filtered rows over the whole table (you chose this)'],
}

type Options = {
  findings?: unknown[]
  answer?: () => string
  complete?: (system: string) => unknown
  kept?: Record<string, unknown>
  draft?: string
}

// Stubs the model by its system prompt, the questions, the box and the store.
const engine = (on: any, { findings = [FINDING], answer, complete, kept = {}, draft = '' }: Options = {}) => {
  const clock = mock.clock(on, { now: NOW })
  const asked: any[] = []
  const fills: string[] = []
  const toasts: string[] = []
  on('store.get', (_: unknown, e: any) => ({ value: kept[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: any) => {
    delete kept[e.key]
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'brain-dump' } }))
  on('session.id', () => ({ value: 's1' }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_: unknown, e: any) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('ui.toast', (_: unknown, e: any) => {
    toasts.push(e.text ?? e.message)
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' } as any, (_: unknown, e: any) => {
    asked.push(e)
    return { result: { answers: { [e.questions?.[0]?.question]: (answer ?? (() => 'Filtered rows (recommended)'))() } } } as any
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', children: ['engine'] }))
  on('model.complete', (_: unknown, e: any) => {
    const reply =
      complete?.(e.system) ??
      (e.system.startsWith('You split')
        ? POINTS
        : e.system.startsWith('You compare')
          ? { findings }
          : e.system.startsWith('The owner answered')
            ? { points: [], removed: [], findings: [], resolved: [] }
            : SECTIONS)
    return { value: { isAnswered: true, text: typeof reply === 'string' ? reply : JSON.stringify(reply), usage: {} } }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  const sent: string[] = []
  on('prompt.submit', (_: unknown, e: any) => {
    sent.push(e.text)
    return { text: e.text }
  })
  return { clock, asked, fills, toasts, kept, sent }
}

const submit = ($: any, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

test('structure: asks the question, builds the prompt and keeps it pending', async ($, on) => {
  const { clock, asked, fills, kept } = engine(on)
  await $.session.start(START)

  const dropped = await submit($, 'structure: export the orders table, only filtered rows, also the whole table')
  expect(dropped).toMatchObject({ drop: expect.stringContaining('Structuring') })
  await clock.advance(0)
  await clock.advance(0)

  expect(fills).toContain('')
  expect(asked).toHaveLength(1)
  expect(asked[0].questions[0].question).toContain('Question 1 of 1:')
  expect(asked[0].questions[0].options[0].label).toContain('(recommended)')
  const pending = kept['pending:s1'] as any
  expect(pending.stage).toBe('ready')
  expect(pending.prompt).toContain('## Decisions')
  expect(pending.prompt).not.toContain('Type go')
})

test('go sends the structured prompt, not the dump, and clears the pending dump', async ($, on) => {
  const kept = {
    'pending:s1': { dump: 'raw dump', points: [], findings: [], answers: [], prompt: 'THE PROMPT', stage: 'ready', at: NOW },
  }
  const { sent } = engine(on, { kept })
  await $.session.start(START)

  await submit($, ' Go ')
  expect(sent).toEqual(['THE PROMPT'])
  expect(kept['pending:s1' as keyof typeof kept]).toBeUndefined()
})

test('cancel puts the dump back after the drop and clears the pending dump', async ($, on) => {
  const kept: Record<string, unknown> = {
    'pending:s1': { dump: 'raw dump', points: [], findings: [], answers: [], prompt: 'P', stage: 'ready', at: NOW },
  }
  const { clock, fills } = engine(on, { kept })
  await $.session.start(START)

  const r = await submit($, 'cancel')
  expect(r).toMatchObject({ drop: expect.stringContaining('cancelled') })
  expect(fills).toEqual([])
  await clock.advance(0)
  expect(fills).toEqual(['raw dump'])
  expect(kept['pending:s1']).toBeUndefined()
})

test('edit puts the prompt in the box and the next submit goes through as typed', async ($, on) => {
  const kept: Record<string, unknown> = {
    'pending:s1': { dump: 'raw dump', points: [], findings: [], answers: [], prompt: 'P', stage: 'ready', at: NOW },
  }
  const { clock, fills, sent } = engine(on, { kept })
  await $.session.start(START)

  await submit($, 'edit')
  await clock.advance(0)
  expect(fills).toEqual(['P'])
  expect((kept['pending:s1'] as any).stage).toBe('editing')

  await submit($, 'my edited prompt')
  expect(sent).toEqual(['my edited prompt'])
  expect(kept['pending:s1']).toBeUndefined()
})

test('other text leaves a ready dump alone and goes through', async ($, on) => {
  const kept: Record<string, unknown> = {
    'pending:s1': { dump: 'd', points: [], findings: [], answers: [], prompt: 'P', stage: 'ready', at: NOW },
  }
  const { sent } = engine(on, { kept })
  await $.session.start(START)

  await submit($, 'something else')
  expect(sent).toEqual(['something else'])
  expect(kept['pending:s1']).toBeDefined()
})

test('a submit while questions are open is dropped', async ($, on) => {
  const kept: Record<string, unknown> = {
    'pending:s1': { dump: 'd', points: [], findings: [], answers: [], prompt: '', stage: 'asking', at: NOW },
  }
  engine(on, { kept })
  await $.session.start(START)

  expect(await submit($, 'go')).toMatchObject({ drop: 'Finish or cancel the brain dump first.' })
})

test('enough stops the questions and the open conflict heads the prompt', async ($, on) => {
  const { clock, kept, asked } = engine(on, { answer: () => 'enough' })
  await $.session.start(START)

  await submit($, 'structure: a long dump')
  await clock.advance(0)
  await clock.advance(0)

  expect(asked).toHaveLength(1)
  expect((kept['pending:s1'] as any).prompt).toContain('Not settled:')
})

test('a model that returns junk puts the dump back and clears the pending dump', async ($, on) => {
  const { clock, fills, toasts, kept } = engine(on, { complete: () => 'not json at all' })
  await $.session.start(START)

  await submit($, 'structure: a long dump')
  await clock.advance(0)
  await clock.advance(0)

  expect(fills).toEqual(['', 'a long dump'])
  expect(toasts.join(' ')).toContain("Couldn't read the dump")
  expect(kept['pending:s1']).toBeUndefined()
})

test('a dismissed question counts as enough', async ($, on) => {
  const { clock, kept } = engine(on)
  on('tool.call', { tool: 'AskUserQuestion' } as any, () => {
    throw new Error('dismissed')
  })
  await $.session.start(START)

  await submit($, 'structure: a long dump')
  await clock.advance(0)
  await clock.advance(0)

  expect((kept['pending:s1'] as any).stage).toBe('ready')
})

test('no findings builds the prompt without asking', async ($, on) => {
  const { clock, asked, toasts, kept } = engine(on, { findings: [] })
  await $.session.start(START)

  await submit($, 'structure: a long dump')
  await clock.advance(0)
  await clock.advance(0)

  expect(asked).toHaveLength(0)
  expect(toasts.join(' ')).toContain('No conflicts found; 0 assumptions listed')
  expect((kept['pending:s1'] as any).stage).toBe('ready')
})

test('/brain-dump off persists and turns the banner off', async ($, on) => {
  const { kept } = engine(on)
  await $.session.start(START)

  const r = await $.command.run({ command: 'brain-dump', args: 'off' } as never)
  expect(r).toMatchObject({ text: 'Brain dump auto-detect is off.' })
  expect(kept.enabled).toBe(false)
})

test('a non-interactive run does not touch prompts', async ($, on) => {
  const { sent } = engine(on)
  await $.session.start({ ...START, isInteractive: false })

  await submit($, 'structure: a long dump')
  expect(sent).toEqual(['structure: a long dump'])
})
