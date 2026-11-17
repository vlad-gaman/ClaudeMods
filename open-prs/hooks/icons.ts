/** Lucide icons (ISC licence) as inline SVG, for the desktop surface, which draws `Svg`; the terminal keeps its glyphs. */
const PATHS = {
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  approved: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  changes: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  required: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  draft:
    '<path d="M10.1 2.18a10 10 0 0 1 3.8 0"/><path d="M17.6 3.71a10 10 0 0 1 2.69 2.7"/><path d="M21.82 10.1a10 10 0 0 1 0 3.8"/><path d="M20.29 17.6a10 10 0 0 1-2.7 2.69"/><path d="M13.9 21.82a10 10 0 0 1-3.8 0"/><path d="M6.4 20.29a10 10 0 0 1-2.69-2.7"/><path d="M2.18 13.9a10 10 0 0 1 0-3.8"/><path d="M3.71 6.4a10 10 0 0 1 2.7-2.69"/>',
  merged: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  succeeded: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  failed: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  running: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  queued: '<circle cx="12" cy="12" r="10"/>',
  partial: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  cancelled: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
}

export type IconName = keyof typeof PATHS

/** The theme tones as hex: an `Svg` cannot name a theme colour. */
export const HEX: Record<string, string> = {
  error: '#f87171',
  warning: '#fbbf24',
  success: '#4ade80',
  inactive: '#9ca3af',
  suggestion: '#38bdf8',
  merged: '#c084fc',
}

/** One icon as an SVG document, stroked in a tone. */
export const iconSvg = (name: IconName, tone: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${HEX[tone] ?? HEX.inactive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`

const W = 320
/** A bar given no width takes the markup's own, up to the slot, so a full-width bar is marked wider than any pane. */
const FULL = 2000
const TRACK = '#374151'

/** The status bar: one rounded segment per status in its tone, the no-PR one striped. `parts` are widths in any unit. */
export const statusBarSvg = (parts: { tone: string; width: number; isStriped: boolean }[]) => {
  const total = parts.reduce((sum, part) => sum + part.width, 0) || 1
  const gap = 3
  const usable = W - gap * Math.max(0, parts.length - 1)
  let x = 0
  const rects = parts.map(part => {
    const w = (part.width / total) * usable
    const colour = HEX[part.tone] ?? HEX.inactive
    const rect = part.isStriped
      ? `<rect x="${x}" y="0" width="${w}" height="8" rx="3" fill="url(#stripes)" stroke="${colour}" stroke-width="1"/>`
      : `<rect x="${x}" y="0" width="${w}" height="8" rx="3" fill="${colour}"/>`
    x += w + gap
    return rect
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FULL}" height="8" viewBox="0 0 ${W} 8" preserveAspectRatio="none"><defs><pattern id="stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="${HEX.inactive}"/></pattern></defs>${rects.join('')}</svg>`
}

/** A thin progress bar: a track, filled by the share of `done` in `total`, in a tone. */
export const progressSvg = (done: number, total: number, tone: string, isFull = false) => {
  const w = isFull ? W : 120
  const filled = total > 0 ? (done / total) * w : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${isFull ? FULL : w}" height="6" viewBox="0 0 ${w} 6"${isFull ? ' preserveAspectRatio="none"' : ''}><rect width="${w}" height="6" rx="3" fill="${TRACK}"/>${filled > 0 ? `<rect width="${filled}" height="6" rx="3" fill="${HEX[tone] ?? HEX.inactive}"/>` : ''}</svg>`
}

/** A run chip as one slim pill: an outline in the run's tone, its icon and its name. Returns the markup and its width. */
export const pillSvg = (name: IconName, tone: string, label: string) => {
  const colour = HEX[tone] ?? HEX.inactive
  const width = Math.ceil(34 + label.length * 6.8)
  const text = label.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="22" viewBox="0 0 ${width} 22"><rect x="0.5" y="0.5" width="${width - 1}" height="21" rx="10.5" fill="none" stroke="${colour}" stroke-opacity="0.7"/><g transform="translate(9 4) scale(0.58)" fill="none" stroke="${colour}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</g><text x="27" y="15" font-family="system-ui, sans-serif" font-size="12" fill="#d1d5db">${text}</text></svg>`
  return { source, width }
}
