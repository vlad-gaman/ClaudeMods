import type { EngineInterface } from 'claude-code'

import type { ChatTokens, Figures } from '../types'
import { cacheState, segments } from './figures'

type Parts = ReturnType<EngineInterface['ui']['resolve']>

export const band = (
  { Box, Button, Text }: Parts,
  f: Figures,
  c: ChatTokens | null,
  now: number,
  onHide: () => void,
) => {
  const { warm, detail } = cacheState(f, c, now)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {segments(f, c, now).map(s => (
          <Text key={s.key}>
            <Text dimColor>{s.label} </Text>
            <Text key={`${s.key}-value`} color={s.color} bold>{s.value}</Text>
            <Text dimColor>{s.detail}</Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Text key="cache">
          <Text dimColor>Cache </Text>
          <Text key="cache-state" color={warm ? 'success' : 'warning'}>
            {warm ? '● warm' : '○ cold'}
          </Text>
          <Text color={warm ? undefined : 'warning'} dimColor={warm}>{detail ? ` ${detail}` : ''}</Text>
        </Text>
        <Button key="hide" label="Hide" plain onPress={onHide} />
      </Box>
    </Box>
  )
}
