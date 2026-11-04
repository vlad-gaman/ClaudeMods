import { PICKS } from './data'

export const nameOf = (id: string) => id.split('@')[0] ?? id

export const words = (t: string, n = 9) => t.split(/\s+/).slice(0, n).join(' ')

export const titleOf = (id: string) =>
  nameOf(id).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

export const emojiOf = (id: string) => PICKS.find(p => nameOf(id).includes(p.word))?.emoji ?? '🧩'

export const lucideOf = (id: string) => PICKS.find(p => nameOf(id).includes(p.word))?.lucide ?? 'puzzle'
