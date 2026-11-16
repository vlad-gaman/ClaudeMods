import type { EngineInterface as Engine } from 'claude-code'

import type { ReadyView } from '../types'
import { GO_LINE } from './logic'

type Parts = ReturnType<Engine['ui']['resolve']>

/** The offer to structure a long draft. */
export function offerBand(
  { Box, Button, Text }: Parts,
  words: number,
  onStructure: () => void | Promise<void>,
  onIgnore: () => void | Promise<void>,
) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Long draft ({words} words). Turn it into one clear prompt?</Text>
      <Box>
        <Button key="structure" label="Structure" variant="primary" onPress={onStructure} />
        <Text> </Text>
        <Button key="ignore" label="Ignore" role="dismiss" onPress={onIgnore} />
      </Box>
    </Box>
  )
}

/** Shown while the model reads the dump or works out the next question. */
export function busyBand({ Box, Text }: Parts, message: string) {
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text dimColor>{message}</Text>
    </Box>
  )
}

/** The structured prompt, collapsed to a count and a few lines until Show all. */
export function readyBand(
  { Box, Button, Text }: Parts,
  ready: ReadyView,
  isExpanded: boolean,
  onToggle: () => void,
) {
  const lines = isExpanded ? ready.preview : ready.preview.slice(0, 4)
  const hidden = ready.count - lines.length
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Structured prompt ({ready.count} lines)</Text>
      {lines.map((line, i) => (
        <Text key={`l${i}`}>{line}</Text>
      ))}
      {hidden > 0 && (
        <Box>
          <Text dimColor>… {hidden} more lines </Text>
          <Button key="all" label="Show all" onPress={onToggle} />
        </Box>
      )}
      {isExpanded && ready.count > 4 && (
        <Button key="less" label="Show less" onPress={onToggle} />
      )}
      <Text dimColor>{GO_LINE}</Text>
    </Box>
  )
}
