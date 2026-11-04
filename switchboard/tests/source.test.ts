import { expect, test } from 'claude-code/testing'

import { commandNameOf, panesOf } from '../hooks/source'

test('commandNameOf reads a single-quoted name, across lines, and nothing else', () => {
  expect(commandNameOf("$.command.register({ name: 'cost', description: 'x' })")).toBe('cost')
  expect(commandNameOf("command.register({\n   name: 'two-words' })")).toBe('two-words')
  expect(commandNameOf('command.register({ name: "q" })')).toBeUndefined()
  expect(commandNameOf('no command here')).toBeUndefined()
})

test('panesOf reads quoted ids and the const an id names, once each', () => {
  const source = `const PANE = "from-const"
    $.ui.open({ id: 'a' }); $.ui.open({ id: "b" }); $.ui.open({ id: PANE }); $.ui.open({ id: PANE }); $.ui.open({ id: 'a' })`
  expect(panesOf(source)).toEqual(['a', 'b', 'from-const'])
})

test('panesOf drops an id whose const is not found', () => {
  expect(panesOf('$.ui.open({ id: MISSING })')).toEqual([])
})
