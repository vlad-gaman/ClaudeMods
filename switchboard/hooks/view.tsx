import type { EngineInterface, RenderChildren } from 'claude-code'

import type { Mod } from '../types'
import { LUCIDE } from './data'
import { emojiOf, lucideOf, titleOf } from './names'

export type Parts = ReturnType<EngineInterface['ui']['resolve']>
export type SvgPart = Extract<Parts, { Svg: unknown }>['Svg']

// Desktop width of one text cell in px (estimated: 6 cells overshot the 38px switch by ~7px).
// The switch is drawn exactly 5 cells wide so the invisible button matches it.
const CELL_PX = 7.5

const STROKE = 'fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

// Gradient track, white knob with a soft shadow: green when on, light grey when off.
const switchSvg = (isOn: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 20" width="38" height="20">` +
  `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${isOn ? '#3dbb00' : '#e9e9e9'}"/>` +
  `<stop offset="1" stop-color="${isOn ? '#2a8a00' : '#d6d6d6'}"/></linearGradient>` +
  `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.5" stdDeviation="0.6" flood-opacity="0.35"/></filter></defs>` +
  `<rect x="0.5" y="0.5" width="37" height="19" rx="9.5" fill="url(#g)" stroke="${isOn ? '#2a8a00' : '#c4c4c4'}"/>` +
  `<circle cx="${isOn ? 28 : 10}" cy="10" r="7" fill="#fff" filter="url(#s)"/></svg>`

// A Lucide icon drawn mid-grey so it reads on light and dark; `opacity` fades it when given.
const lucideSvg = (name: string, size: number, opacity?: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE}${opacity === undefined ? '' : ` opacity="${opacity}"`}>${LUCIDE[name]}</svg>`

// Desktop icon: faded when off. A mod's own icon.svg wins; fade it by wrapping it in a faded group.
const iconSvg = (m: Mod) => {
  const fade = m.isEnabled ? 1 : 0.45
  if (m.iconSvg) return m.iconSvg.replace(/(<svg[^>]*>)/i, `$1<g opacity="${fade}">`).replace(/<\/svg>\s*$/i, '</g></svg>')

  return lucideSvg(m.lucide && LUCIDE[m.lucide] ? m.lucide : lucideOf(m.id), 20, fade)
}

export type Pane = {
  mods: Mod[]
  closedIds: string[]
  message: string
  onToggleEnabled: (mod: Mod) => void
  onToggleClosed: (mod: Mod) => void
  onRefresh: () => void
}

// No absolute positioning: the picture is in flow, and the plain Button follows it in flow with a
// negative left margin so it sits over the picture and is the hit target.
const overlay = ({ Box }: Parts, key: string, cells: number, picture: RenderChildren, button: RenderChildren) => (
  <Box key={key} flexDirection="row" width={cells} flexShrink={0}>
    <Box width={cells} flexShrink={0}>{picture}</Box>
    <Box width={cells} marginLeft={-cells} overflow="hidden" flexShrink={0}>{button}</Box>
  </Box>
)

// `Svg` is the engine's SVG element, given on the desktop surface only; the terminal gets text.
export const pane = (parts: Parts, Svg: SvgPart | undefined, p: Pane) => {
  const { Box, Text, Button } = parts

  const control = (m: Mod) =>
    Svg ? (
      overlay(
        parts,
        `sw-${m.id}`,
        5,
        <Svg source={switchSvg(m.isEnabled)} alt={`${m.id} is ${m.isEnabled ? 'on' : 'off'}`} width={CELL_PX * 5} height={20} />,
        <Button key={m.id} plain label={' '.repeat(5)} onPress={() => p.onToggleEnabled(m)} />,
      )
    ) : (
      <Button key={m.id} onPress={() => p.onToggleEnabled(m)}>
        <Text color={m.isEnabled ? 'green' : 'gray'}>{m.isEnabled ? '( ●) ON ' : '(● ) OFF'}</Text>
      </Button>
    )

  const eye = (m: Mod) => {
    const isClosed = p.closedIds.includes(m.id)
    // Only a mod that opens a pane has something to close; a band has no handle here, and switchboard keeps no eye of its own.
    if (!m.panes?.length || m.id.startsWith('switchboard@')) return <Box key={`eye-${m.id}`} width={2} flexShrink={0} />

    return Svg ? (
      overlay(
        parts,
        `eye-${m.id}`,
        2,
        <Svg source={lucideSvg(isClosed ? 'eye-off' : 'eye', CELL_PX * 2)} alt={isClosed ? 'Open its pane' : 'Close its pane'} width={CELL_PX * 2} height={CELL_PX * 2} />,
        <Button key={`hide-${m.id}`} plain label={' '.repeat(2)} onPress={() => p.onToggleClosed(m)} />,
      )
    ) : (
      <Button key={`hide-${m.id}`} onPress={() => p.onToggleClosed(m)}>
        <Text dimColor>{isClosed ? '◌' : '◉'}</Text>
      </Button>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {p.mods.length === 0 && <Text dimColor>No installed mods found.</Text>}
      {p.mods.map(m => (
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
      {p.message !== '' && <Text dimColor>{p.message}</Text>}
      <Button key="refresh" onPress={p.onRefresh}>
        <Text dimColor>Refresh</Text>
      </Button>
    </Box>
  )
}
