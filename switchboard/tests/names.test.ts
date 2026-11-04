import { expect, test } from 'claude-code/testing'

import { emojiOf, lucideOf, nameOf, titleOf, words } from '../hooks/names'

test('a plugin id gives a title from its name before the @', () => {
  expect(nameOf('cost-meter@local-mods')).toBe('cost-meter')
  expect(titleOf('cost-meter@local-mods')).toBe('Cost Meter')
  expect(titleOf('switchboard')).toBe('Switchboard')
})

test('the emoji and Lucide icon come from the first matching word in the name, else a puzzle', () => {
  expect([emojiOf('cost-meter@m'), lucideOf('cost-meter@m')]).toEqual(['💰', 'coins'])
  expect([emojiOf('sound-git@m'), lucideOf('sound-git@m')]).toEqual(['🛡️', 'shield-check'])
  expect([emojiOf('mystery@m'), lucideOf('mystery@m')]).toEqual(['🧩', 'puzzle'])
  // The word is looked for in the name only, not in the source after the @.
  expect(lucideOf('mystery@cost')).toBe('puzzle')
})

test('words keeps the first nine words by default', () => {
  expect(words('a b c d e f g h i j k')).toBe('a b c d e f g h i')
  expect(words('')).toBe('')
  expect(words('a b c', 2)).toBe('a b')
})
