// Lucide icons (https://lucide.dev, ISC licence), 24px outline, black in light themes and white in dark.
export const ICONS = {
  todo: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  files:
    '<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/>',
  plug: '<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>',
  skills:
    '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
} as const
export const GLYPH = { todo: '☑', files: '▤', plug: '⇄', skills: '⚡︎' } as const
// Connector icons (Lucide), picked by a word in the server's name; the plug otherwise.
export const CONN_ICON = {
  plug: ICONS.plug,
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  terminal: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  pr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
} as const
export const CONN_WORDS: [string, keyof typeof CONN_ICON][] = [
  ['browser', 'globe'], ['chrome', 'globe'], ['terminal', 'terminal'], ['schedul', 'clock'],
  ['registry', 'search'], ['search', 'search'], ['session', 'layers'], ['directory', 'folder'],
  ['settings', 'settings'], ['_pr', 'pr'], ['visualize', 'chart'], ['docs', 'plug'],
]
// To-do status marks, radio-style: empty ring, ring and dot, filled ring.
export const BOX = {
  pending: '<circle cx="12" cy="12" r="9"/>',
  in_progress: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  completed: '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
} as const
const FILE_BASE =
  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>'
export const FILE_ICON = {
  text: FILE_BASE + '<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  code: FILE_BASE + '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/>',
  json: FILE_BASE + '<path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
  sheet: FILE_BASE + '<path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  image: FILE_BASE + '<circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>',
  plain: FILE_BASE,
} as const
export const KIND_OF: Record<string, keyof typeof FILE_ICON> = {
  md: 'text', mdx: 'text', txt: 'text', rst: 'text', rtf: 'text', doc: 'text', docx: 'text', pdf: 'text',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', tsv: 'sheet',
  json: 'json', jsonc: 'json',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  yaml: 'code', yml: 'code', toml: 'code', js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', sh: 'code',
}
export const BOX_COLOR = { pending: '', in_progress: '#f97316', completed: '#22c55e' } as const
export const MARK = { pending: '[ ]', in_progress: '[~]', completed: '[x]' } as const
// A claude.ai connector's tools are named by its id, not its name, and the engine gives a mod no way to
// look the name up: the ones this person has are listed here (add more as `id: 'Name'`).
export const KNOWN_CONNECTORS: Record<string, string> = {
  'c97b9d07-a0a9-440c-ace0-81c9338b3740': 'Gmail',
  '1a59c906-04da-521d-bda7-7f71b9f9e01c': 'Claude Docs',
}
