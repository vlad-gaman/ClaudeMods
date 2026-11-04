import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mod } from '../types'

const PANE = 'switchboard'
// Desktop width of one text cell in px (estimated: 6 cells overshot the 38px switch by ~7px).
// The switch is drawn exactly 5 cells wide so the invisible button matches it.
const CELL_PX = 7.5
const mods = atom({ plugin: 'switchboard', key: 'mods' } as const, [], { shape: 'mods-3' })
// Hand-written one-liners (under 10 words) win over a plugin.json description.
const BLURBS: Record<string, string> = {
  'usage-band': 'Shows chat, 5-hour and weekly usage',
}
const words = (t: string, n = 9) => t.split(/\s+/).slice(0, n).join(' ')
const titleOf = (id: string) =>
  nameOf(id).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
// Icon: an emoji picked from words in the mod's name; a puzzle piece when none fits.
const EMOJIS: [string, string][] = [
  ['usage', '📊'], ['cost', '💰'], ['tool', '🛠️'], ['git', '🛡️'], ['guard', '🛡️'], ['sound', '🔊'],
  ['lint', '🧹'], ['switch', '🎛️'], ['theme', '🎨'], ['clock', '⏰'], ['note', '📝'], ['search', '🔎'],
]
const emojiOf = (id: string) => EMOJIS.find(([word]) => nameOf(id).includes(word))?.[1] ?? '🧩'
// Lucide icons (lucide.dev, ISC licence): inner markup of each 24x24 icon.
const LUCIDE: Record<string, string> = {
  "activity": "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />",
  "bell": "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\" /> <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" />",
  "bookmark": "<path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\" />",
  "bot": "<path d=\"M12 8V4H8\" /> <rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\" /> <path d=\"M2 14h2\" /> <path d=\"M20 14h2\" /> <path d=\"M15 13v2\" /> <path d=\"M9 13v2\" />",
  "brain": "<path d=\"M12 18V5\" /> <path d=\"M15 13a4.17 4.17 0 01-3-4 4.17 4.17 0 01-3 4\" /> <path d=\"M17.707 6.294A3 3 0 1012 5a3 3 0 10-5.707 1.294\" /> <path d=\"M17.996 5.125a4 4 0 012.526 5.77\" /> <path d=\"M18 18a4 4 0 002-7.465\" /> <path d=\"M19.967 17.482a4 4 0 11-7.967.517 4 4 0 11-7.967-.517\" /> <path d=\"M6 18a4 4 0 01-2-7.465\" /> <path d=\"M6.004 5.125a4 4 0 00-2.526 5.77\" />",
  "brush-cleaning": "<path d=\"m16 22-1-4\" /> <path d=\"M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1\" /> <path d=\"M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z\" /> <path d=\"m8 22 1-4\" />",
  "camera": "<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" /> <circle cx=\"12\" cy=\"13\" r=\"3\" />",
  "chart-column": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\" /> <path d=\"M18 17V9\" /> <path d=\"M13 17V5\" /> <path d=\"M8 17v-3\" />",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 6v6l4 2\" />",
  "cloud": "<path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\" />",
  "code": "<path d=\"m16 18 6-6-6-6\" /> <path d=\"m8 6-6 6 6 6\" />",
  "coins": "<path d=\"M13.744 17.736a6 6 0 1 1-7.48-7.48\" /> <path d=\"M15 6h1v4\" /> <path d=\"m6.134 14.768.866-.5 2 3.464\" /> <circle cx=\"16\" cy=\"8\" r=\"6\" />",
  "cpu": "<path d=\"M12 20v2\" /> <path d=\"M12 2v2\" /> <path d=\"M17 20v2\" /> <path d=\"M17 2v2\" /> <path d=\"M2 12h2\" /> <path d=\"M2 17h2\" /> <path d=\"M2 7h2\" /> <path d=\"M20 12h2\" /> <path d=\"M20 17h2\" /> <path d=\"M20 7h2\" /> <path d=\"M7 20v2\" /> <path d=\"M7 2v2\" /> <rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\" /> <rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\" />",
  "database": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\" /> <path d=\"M3 5V19A9 3 0 0 0 21 19V5\" /> <path d=\"M3 12A9 3 0 0 0 21 12\" />",
  "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "eye-off": "<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /> <path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /> <path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /> <path d=\"m2 2 20 20\" />",
  "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" /> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\" /> <path d=\"M10 9H8\" /> <path d=\"M16 13H8\" /> <path d=\"M16 17H8\" />",
  "flag": "<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\" />",
  "folder": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />",
  "gauge": "<path d=\"m12 14 4-4\" /> <path d=\"M3.34 19a10 10 0 1 1 17.32 0\" />",
  "git-branch": "<path d=\"M15 6a9 9 0 0 0-9 9V3\" /> <circle cx=\"18\" cy=\"6\" r=\"3\" /> <circle cx=\"6\" cy=\"18\" r=\"3\" />",
  "globe": "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /> <path d=\"M2 12h20\" />",
  "hammer": "<path d=\"m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9\" /> <path d=\"m18 15 4-4\" /> <path d=\"m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5\" />",
  "heart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />",
  "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /> <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />",
  "key": "<path d=\"m2 21 9.6-9.6\" /> <path d=\"m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19\" /> <circle cx=\"15.5\" cy=\"7.5\" r=\"5.5\" />",
  "layout-dashboard": "<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\" /> <rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\" />",
  "list-checks": "<path d=\"M13 5h8\" /> <path d=\"M13 12h8\" /> <path d=\"M13 19h8\" /> <path d=\"m3 17 2 2 4-4\" /> <path d=\"m3 7 2 2 4-4\" />",
  "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
  "mail": "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\" /> <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" />",
  "message-square": "<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\" />",
  "music": "<path d=\"M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19\" /> <circle cx=\"18\" cy=\"16\" r=\"3\" /> <circle cx=\"6\" cy=\"19\" r=\"3\" />",
  "notebook-pen": "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" /> <path d=\"M2 6h4\" /> <path d=\"M2 10h4\" /> <path d=\"M2 14h4\" /> <path d=\"M2 18h4\" /> <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\" />",
  "palette": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /> <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
  "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\" />",
  "puzzle": "<path d=\"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z\" />",
  "rocket": "<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\" /> <path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\" /> <path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\" /> <path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\" />",
  "search": "<path d=\"m21 21-4.34-4.34\" /> <circle cx=\"11\" cy=\"11\" r=\"8\" />",
  "settings": "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "shield": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />",
  "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> <path d=\"m9 12 2 2 4-4\" />",
  "sliders-horizontal": "<path d=\"M10 5H3\" /> <path d=\"M12 19H3\" /> <path d=\"M14 3v4\" /> <path d=\"M16 17v4\" /> <path d=\"M21 12h-9\" /> <path d=\"M21 19h-5\" /> <path d=\"M21 5h-7\" /> <path d=\"M8 10v4\" /> <path d=\"M8 12H3\" />",
  "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /> <path d=\"M20 2v4\" /> <path d=\"M22 4h-4\" /> <circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />",
  "terminal": "<path d=\"M12 19h8\" /> <path d=\"m4 17 6-6-6-6\" />",
  "timer": "<line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\" /> <line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\" /> <circle cx=\"12\" cy=\"14\" r=\"8\" />",
  "volume-2": "<path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\" /> <path d=\"M16 9a5 5 0 0 1 0 6\" /> <path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\" />",
  "wand-sparkles": "<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /> <path d=\"m14 7 3 3\" /> <path d=\"M5 6v4\" /> <path d=\"M19 14v4\" /> <path d=\"M10 2v2\" /> <path d=\"M7 8H3\" /> <path d=\"M21 16h-4\" /> <path d=\"M11 3H9\" />",
  "wifi": "<path d=\"M12 20h.01\" /> <path d=\"M2 8.82a15 15 0 0 1 20 0\" /> <path d=\"M5 12.859a10 10 0 0 1 14 0\" /> <path d=\"M8.5 16.429a5 5 0 0 1 7 0\" />",
  "wrench": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />",
  "zap": "<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\" />",
}
const ICONS: [string, string][] = [
  ["usage", "chart-column"],
  ["cost", "coins"],
  ["tool", "wrench"],
  ["git", "shield-check"],
  ["guard", "shield-check"],
  ["sound", "volume-2"],
  ["lint", "brush-cleaning"],
  ["switch", "sliders-horizontal"],
  ["theme", "palette"],
  ["clock", "clock"],
  ["note", "notebook-pen"],
  ["search", "search"],
]
const lucideOf = (id: string) => ICONS.find(([word]) => nameOf(id).includes(word))?.[1] ?? 'puzzle'
// Desktop icon: the Lucide shape, drawn mid-grey so it reads on light and dark; faded when off.
const iconSvg = (m: Mod) => {
  const fade = m.isEnabled ? 1 : 0.45
  // A mod's own icon.svg wins; fade it by wrapping it in a faded group.
  if (m.iconSvg) return m.iconSvg.replace(/(<svg[^>]*>)/i, `$1<g opacity="${fade}">`).replace(/<\/svg>\s*$/i, '</g></svg>')
  const name = m.lucide && LUCIDE[m.lucide] ? m.lucide : lucideOf(m.id)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${fade}">${LUCIDE[name]}</svg>`
}
const sourceOf = (id: string) => id.split('@')[1] ?? 'other'
const nameOf = (id: string) => id.split('@')[0]

// Mods whose pane is shut right now. Only what the engine reports: a pane opening or closing, by anyone,
// moves its mod in or out of this list, so the eye never claims more than is true.
const closed = atom({ plugin: 'switchboard', key: 'closed' } as const, [], { shape: 'closed-2' })
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '', { shape: 'note-1' })

const refresh = async ($: EngineInterface) => {
  const ran = await $.process.run(['claude', 'plugin', 'list', '--json'])
  if (ran.exitCode !== 0) {
    await update($, note, () => `List failed: ${ran.stderr.slice(0, 120)}`)

    return
  }
  const list = JSON.parse(ran.stdout) as { id: string; version: string; enabled: boolean; installPath: string }[]
  // A mod is a plugin with a hooks module; skip subagent/skill-only plugins.
  const found = await Promise.all(
    list.map(async p => {
      try {
        const hooks = JSON.parse((await $.fs.read(`${p.installPath}/hooks/hooks.json`)) as string) as { modules?: string[] }
        if (!hooks.modules?.length) return undefined
        const manifest = JSON.parse((await $.fs.read(`${p.installPath}/.claude-plugin/plugin.json`)) as string) as { description?: string; lucide?: string; icon?: string }
        const source = (await $.fs.read(`${p.installPath}/hooks/${hooks.modules[0]}`)) as string
        const command = /command\.register\(\{\s*name:\s*'([^']+)'/.exec(source)?.[1]
        const lucide = manifest.lucide ?? manifest.icon
        // Pane ids the mod opens: a string id, or a const the id names.
        const panes = [...source.matchAll(/ui\.open\(\{\s*id:\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))/g)]
          .map(m => m[1] ?? m[2] ?? new RegExp(`const ${m[3]}\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1])
          .filter((id): id is string => !!id)
        const iconSvg = await $.fs.read(`${p.installPath}/icon.svg`).then(t => (typeof t === 'string' && t.includes('<svg') ? t : undefined), () => undefined)
        const desc = BLURBS[nameOf(p.id)] ?? words(manifest.description ?? '')

        return { ...p, desc, command, lucide, iconSvg, panes: [...new Set(panes)] }
      } catch {
        return undefined
      }
    }),
  )
  await update($, mods, () =>
    found
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .map(p => ({ id: p.id, version: p.version, isEnabled: p.enabled, desc: p.desc, command: p.command, lucide: p.lucide, iconSvg: p.iconSvg, panes: p.panes }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

const modOfPane = async ($: EngineInterface, id: string) => (await read($, mods)).find(m => m.panes?.includes(id))

// The eye asks the pane to close or open. A call a hook makes does not run that hook again, so the
// result is recorded here; every other open or close (the mod's, the person's X) comes through the hooks below.
const toggleClosed = async ($: EngineInterface, mod: Mod) => {
  const wasClosed = (await read($, closed)).includes(mod.id)
  let failed = ''
  for (const id of mod.panes ?? []) {
    try {
      if (wasClosed) await $.ui.open({ id, title: titleOf(mod.id) })
      else await $.ui.close({ id })
    } catch (err) {
      failed = String(err).slice(0, 100)
    }
  }
  if (failed === '') await update($, closed, list => (wasClosed ? list.filter(x => x !== mod.id) : [...list, mod.id]))
  await update($, note, () => (failed === '' ? `${titleOf(mod.id)} ${wasClosed ? 'opened' : 'closed'}. It stays enabled.` : `${titleOf(mod.id)}: ${failed}`))
}

const toggle = async ($: EngineInterface, mod: Mod) => {
  const verb = mod.isEnabled ? 'disable' : 'enable'
  const ran = await $.process.run(['claude', 'plugin', verb, mod.id], { timeoutMs: 60_000 })
  await update($, note, () =>
    ran.exitCode === 0 ? `${mod.id} ${verb}d. Takes effect on reload or restart.` : `Failed: ${(ran.stderr || ran.stdout).slice(0, 120)}`,
  )
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'switchboard', description: 'Open the switchboard: turn mods on or off' })
    void $.ui.open({ id: PANE, title: 'Switchboard' })
    void refresh($)

    return next(e)
  })

  // Watch every pane open and close, whoever causes it (the mod, the person's X, a command).
  on('ui.open', async ($, e, next) => {
    const result = await next(e)
    const mod = await modOfPane($, e.id)
    if (mod && result.isPlaced) await update($, closed, list => list.filter(x => x !== mod.id))

    return result
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    const mod = e.origin === 'unload' ? undefined : await modOfPane($, e.id)
    if (mod) await update($, closed, list => (list.includes(mod.id) ? list : [...list, mod.id]))

    return result
  })

  on('command.run', { command: 'switchboard' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Switchboard' })
    await refresh($)
    await update($, closed, list => list.filter(x => !x.startsWith('switchboard@')))

    return { text: 'Switchboard opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button } = ui
    const all = await read($, mods)
    const closedIds = await read($, closed)
    const list = all
    const message = await read($, note)

    const Svg = e.surface === 'desktop' ? ui.Svg : undefined
    // Gradient track, white knob with a soft shadow: green when on, light grey when off.
    const switchSvg = (isOn: boolean) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 20" width="38" height="20">` +
      `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${isOn ? '#3dbb00' : '#e9e9e9'}"/>` +
      `<stop offset="1" stop-color="${isOn ? '#2a8a00' : '#d6d6d6'}"/></linearGradient>` +
      `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.5" stdDeviation="0.6" flood-opacity="0.35"/></filter></defs>` +
      `<rect x="0.5" y="0.5" width="37" height="19" rx="9.5" fill="url(#g)" stroke="${isOn ? '#2a8a00' : '#c4c4c4'}"/>` +
      `<circle cx="${isOn ? 28 : 10}" cy="10" r="7" fill="#fff" filter="url(#s)"/></svg>`

    // No absolute positioning: the picture is in flow, and the plain Button follows it in
    // flow with a negative left margin so it sits over the picture and is the hit target.
    const control = (m: Mod) =>
      Svg ? (
        <Box key={`sw-${m.id}`} flexDirection="row" width={5} flexShrink={0}>
          <Box width={5} flexShrink={0}>
            <Svg source={switchSvg(m.isEnabled)} alt={`${m.id} is ${m.isEnabled ? 'on' : 'off'}`} width={CELL_PX * 5} height={20} />
          </Box>
          <Box width={5} marginLeft={-5} overflow="hidden" flexShrink={0}>
            <Button key={m.id} plain label={' '.repeat(5)} onPress={() => toggle($, m)} />
          </Box>
        </Box>
      ) : (
        <Button key={m.id} onPress={() => toggle($, m)}>
          <Text color={m.isEnabled ? 'green' : 'gray'}>{m.isEnabled ? '( ●) ON ' : '(● ) OFF'}</Text>
        </Button>
      )

    const plainIcon = (name: string, size: number) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[name]}</svg>`
    // Same trick as the switch: picture in flow, the plain Button overlapped on it by a negative margin.
    const eye = (m: Mod) => {
      const isClosed = closedIds.includes(m.id)
      // Only a mod that opens a pane has something to close; a band has no handle here, and switchboard keeps no eye of its own.
      if (!m.panes?.length || m.id.startsWith('switchboard@')) return <Box key={`eye-${m.id}`} width={2} flexShrink={0} />

      return Svg ? (
        <Box key={`eye-${m.id}`} flexDirection="row" width={2} flexShrink={0}>
          <Box width={2} flexShrink={0}>
            <Svg source={plainIcon(isClosed ? 'eye-off' : 'eye', CELL_PX * 2)} alt={isClosed ? 'Open its pane' : 'Close its pane'} width={CELL_PX * 2} height={CELL_PX * 2} />
          </Box>
          <Box width={2} marginLeft={-2} overflow="hidden" flexShrink={0}>
            <Button key={`hide-${m.id}`} plain label={' '.repeat(2)} onPress={() => toggleClosed($, m)} />
          </Box>
        </Box>
      ) : (
        <Button key={`hide-${m.id}`} onPress={() => toggleClosed($, m)}>
          <Text dimColor>{isClosed ? '◌' : '◉'}</Text>
        </Button>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {list.length === 0 && <Text dimColor>No installed mods found.</Text>}
        {list.map(m => (
          <Box key={`row-${m.id}`} flexDirection="row" alignItems="center" gap={1}>
            {Svg ? <Svg source={iconSvg(m)} alt={titleOf(m.id)} width={20} height={20} /> : <Text>{emojiOf(m.id)}</Text>}
            <Box flexGrow={1} flexDirection="column">
              <Text bold dimColor={!m.isEnabled}>{titleOf(m.id)}</Text>
              {m.desc && <Text dimColor>{m.desc}</Text>}
              {m.command && <Text color="cyan">/{m.command}</Text>}
            </Box>
            {eye(m)}
            {control(m)}
          </Box>
        ))}
        {message !== '' && <Text dimColor>{message}</Text>}
        <Button key="refresh" onPress={() => refresh($)}>
          <Text dimColor>Refresh</Text>
        </Button>
      </Box>
    )
  })
}
