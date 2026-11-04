import type { EngineInterface, RenderChildren } from 'claude-code'

import type { FileRow, IconRow, SkillRow, Todo, Used } from '../types'
import { BOX, BOX_COLOR, FILE_ICON, GLYPH, ICONS, MARK } from './data'
import { connIcon, connTitle, fileKind } from './names'

export type Parts = ReturnType<EngineInterface['ui']['resolve']>
export type SvgPart = Extract<Parts, { Svg: unknown }>['Svg']

// What the pane shows: the session's to-dos, context files, connectors and skills.
export type Session = {
  title: string
  todos: Todo[]
  contextFiles: FileRow[]
  connectors: Used[]
  icons: IconRow[]
  skills: SkillRow[]
}

// The one SVG envelope: `attrs` are the extra attributes of the <svg> tag, `inner` what it holds.
const envelope = (size: number, attrs: string, inner: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24"' + attrs + '>' + inner + '</svg>'

// A Lucide outline: black in light themes and white in dark, or one given colour.
const outline = (body: string, size = 20, color = '') =>
  envelope(
    size,
    ' fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    (color
      ? '<style>g{stroke:' + color + ';color:' + color + '}</style>'
      : '<style>g{stroke:#000;color:#000}@media (prefers-color-scheme:dark){g{stroke:#fff;color:#fff}}</style>') +
      '<g transform="translate(0 1.2)">' +
      body +
      '</g>',
  )

// A brand icon: filled paths, black in light themes and white in dark.
const filled = (paths: readonly string[], size: number) =>
  envelope(
    size,
    '',
    '<style>g{fill:#000}@media (prefers-color-scheme:dark){g{fill:#fff}}</style><g>' + paths.map(d => '<path d="' + d + '"/>').join('') + '</g>',
  )

const times = (n: number) => `${n}×`
const tone = (s: Todo['status']) => (s === 'in_progress' ? 'yellow' : s === 'completed' ? 'green' : undefined)

// The rows of a section, or its gray empty-state line.
const rows = <T,>({ Text }: Parts, items: T[], empty: string, row: (t: T, n: number) => RenderChildren) =>
  items.length === 0 ? <Text color="gray">{empty}</Text> : items.map(row)

// `Svg` is the engine's SVG element, given on the desktop surface only; the terminal gets text.
export const pane = (parts: Parts, Svg: SvgPart | undefined, s: Session) => {
  const { Box, Text } = parts

  const Panel = (p: { icon: keyof typeof ICONS; title: string; detail: string; children?: RenderChildren }) => (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between" width="100%">
        <Box alignItems="center">
          {Svg ? (
            <Box marginRight={1} alignItems="center">
              <Svg source={outline(ICONS[p.icon])} alt={p.title} width={20} height={20} />
            </Box>
          ) : (
            <Text bold size="heading">
              {GLYPH[p.icon]}{" "}
            </Text>
          )}
          <Text bold size="heading">
            {p.title}
          </Text>
        </Box>
        <Text color="gray">{p.detail}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {p.children}
      </Box>
    </Box>
  )

  const Sep = () => (
    <Box width="100%" height={1} overflow="hidden" marginY={0}>
      <Text color="gray" dimColor wrap="wrap">
        {'─'.repeat(200)}
      </Text>
    </Box>
  )

  // The column before every item's text, one width in all sections so the texts line up: an Svg where
  // the surface has one, else the text fallback, and nothing when no source is given (Skills).
  const Slot = (p: { source?: string; size?: number; alt?: string; fallback?: RenderChildren }) => (
    <Box width={3} flexShrink={0}>
      {p.source === undefined ? null : Svg ? <Svg source={p.source} alt={p.alt ?? ''} width={p.size} height={p.size} /> : p.fallback}
    </Box>
  )

  // One list entry of Context files, Connectors and Skills: slot, bold title, gray right and sub line, a rule above all but the first.
  const Item = (p: { n: number; slot: RenderChildren; title: string; right: string; sub?: string }) => (
    <Box flexDirection="column" width="100%">
      {p.n > 0 && <Sep />}
      <Box alignItems="center" width="100%">
        {p.slot}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box justifyContent="space-between" width="100%">
            <Text bold>{p.title}</Text>
            <Text color="gray">{p.right}</Text>
          </Box>
          {p.sub !== undefined && p.sub !== '' && <Text color="gray">{p.sub}</Text>}
        </Box>
      </Box>
    </Box>
  )

  const done = s.todos.filter(t => t.status === 'completed').length
  const tokens = s.contextFiles.reduce((n, f) => n + f.tokens, 0)
  const iconPaths = (server: string) => s.icons.find(i => i.server === server)?.paths ?? []

  return (
    <Box flexDirection="column">
      <Panel icon="todo" title="To-do" detail={`${done}/${s.todos.length} done`}>
        {s.todos.length > 0 && s.title !== '' && (
          <Box marginBottom={1}>
            <Text bold>{s.title}</Text>
          </Box>
        )}
        {rows(parts, s.todos, 'No to-dos yet.', t => (
          <Box alignItems="flex-start" width="100%">
            <Slot
              source={outline(BOX[t.status], 16, BOX_COLOR[t.status])}
              size={16}
              alt={t.status}
              fallback={<Text color={tone(t.status)}>{MARK[t.status]}</Text>}
            />
            <Box flexGrow={1} flexShrink={1}>
              <Text
                color={t.status === 'completed' ? 'gray' : undefined}
                strikethrough={t.status === 'completed'}
                bold={t.status === 'in_progress'}
              >
                {t.text}
              </Text>
            </Box>
          </Box>
        ))}
      </Panel>
      <Panel icon="files" title="Context files" detail={`${s.contextFiles.length} · ~${tokens} tokens`}>
        {rows(parts, s.contextFiles, 'None loaded.', (f, n) => {
          const name = f.path.split(/[\\/]/).pop() ?? f.path
          return (
            <Item
              n={n}
              slot={<Slot source={outline(FILE_ICON[fileKind(f.path)], 18)} size={18} alt="file" fallback={<Text>▤</Text>} />}
              title={name}
              right={`${f.type} · ${f.tokens}t`}
              sub={f.path.slice(0, f.path.length - name.length).replace(/[\\/]+$/, '')}
            />
          )
        })}
      </Panel>
      <Panel icon="plug" title="Connectors" detail={`${s.connectors.length} used`}>
        {rows(parts, s.connectors, 'No connector used yet.', (c, n) => (
          <Item
            n={n}
            slot={
              <Slot
                source={iconPaths(c.server).length > 0 ? filled(iconPaths(c.server), 18) : outline(connIcon(c.server), 18)}
                size={18}
                alt={c.server}
                fallback={<Text>⇄</Text>}
              />
            }
            title={connTitle(c.server)}
            right={times(c.count)}
            sub={c.tool ?? `mcp__${c.server}__*`}
          />
        ))}
      </Panel>
      <Panel icon="skills" title="Skills" detail={`${s.skills.length} used`}>
        {rows(parts, s.skills, 'No skill used yet.', (k, n) => (
          <Item n={n} slot={<Slot />} title={'/' + k.name} right={times(k.count)} sub={k.desc} />
        ))}
      </Panel>
    </Box>
  )
}
