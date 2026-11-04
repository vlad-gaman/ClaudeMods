import type { EngineInterface as Engine, RenderSurface } from 'claude-code'

import type { HandoffStep, HandoffView } from '../types'
import { deleteArgv, newChatArgv, newChatUrl, openArgv, osOf } from './argv'

type Parts = ReturnType<Engine['ui']['resolve']>

const glyph = (s: HandoffStep) =>
  s.status === 'done' ? '✓' : s.status === 'error' ? '✗' : s.status === 'running' ? '…' : '·'

const colorOf = (s: HandoffStep) =>
  s.status === 'done' ? 'green' : s.status === 'error' ? 'red' : undefined

async function osNow($: Engine) {
  return osOf(await $.env.get('OS'), await $.env.get('HOME'))
}

// The band above the prompt: the steps and the four buttons. `onClose` hides
// the band; the files are deleted here.
export function band(
  $: Engine,
  { Box, Button, Text }: Parts,
  current: HandoffView,
  surface: RenderSurface,
  onClose: () => Promise<void>,
) {
  const isReady = current.phase === 'ready'

  const needReady = (act: () => void | Promise<void>) => () => {
    if (!isReady) {
      $.ui.toast('The handoff is not saved yet.')
      return
    }
    return act()
  }

  const copy = async () => {
    const text = await $.fs.read(current.path ?? '')
    const r = await $.ui.copy({ text: String(text), surface })
    $.ui.toast(r.isCopied ? 'Handoff copied.' : 'Could not copy the handoff.')
  }

  const startNewChat = async () => {
    const text = String(await $.fs.read(current.path ?? ''))
    const url = newChatUrl(text, current.prompt ?? '', current.cwd ?? '')
    await $.process.run(newChatArgv(await osNow($), url))
    $.ui.toast('Opening a new chat in Claude.')
  }

  const openFile = async () => {
    await $.process.run(openArgv(await osNow($), current.path ?? ''))
  }

  const close = async () => {
    await onClose()
    const files = [current.path, current.promptPath].filter(
      (f): f is string => typeof f === 'string',
    )
    if (current.phase === 'working' || files.length === 0) return
    const r = await $.process.run(deleteArgv(await osNow($), files)).catch(() => null)
    $.ui.toast(
      r && r.exitCode === 0 ? 'Handoff file deleted.' : 'Could not delete the handoff file.',
    )
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>
        Session handoff: {current.title}
        {current.phase === 'failed' ? ' (failed)' : ''}
      </Text>
      {current.steps.map((s, i) => (
        <Text key={`s${i}`} dimColor={s.status === 'pending'}>
          {i + 1}.{' '}
          <Text color={colorOf(s)}>{glyph(s)}</Text>{' '}
          {s.label}
          {s.detail ? ` — ${s.detail}` : ''}
        </Text>
      ))}
      <Box marginTop={1}>
        <Button key="copy" label="Copy prompt" variant="primary" onPress={needReady(copy)} />
        {surface === 'desktop' && <Text> </Text>}
        {surface === 'desktop' && (
          <Button key="new" label="Start a new chat with it" onPress={needReady(startNewChat)} />
        )}
        <Text> </Text>
        <Button key="open" label="Open file" onPress={needReady(openFile)} />
        <Text> </Text>
        <Button key="close" label="Close" role="dismiss" onPress={close} />
      </Box>
    </Box>
  )
}
