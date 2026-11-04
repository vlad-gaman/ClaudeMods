import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { HandoffStep, HandoffView } from '../types'

const view = atom({ plugin: 'session-handoff', key: 'view' } as const, null)

const STEPS = [
  'Read the conversation',
  'Find the files used',
  'List skills, tools and links',
  'Write the handoff',
  'Save it',
  'Check it',
]

const TITLES = {
  command: 'Handoff requested',
  cache: 'Prompt cache goes cold soon',
  context: 'Context window is getting full',
} as const

const READ_TOOLS = new Set(['Read'])
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text

const fileOf = (input: Record<string, unknown>) => {
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

const stamp = (ms: number) =>
  new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19)

let runId = 0
let isRunning = false

const patch = (
  $: Engine,
  id: number,
  fn: (v: HandoffView) => HandoffView,
) => update($, view, v => (v && v.id === id ? fn(v) : v))

async function runHandoff(
  $: Engine,
  trigger: HandoffView['trigger'],
) {
  if (isRunning) return
  isRunning = true
  const id = ++runId
  const steps: HandoffStep[] = STEPS.map(label => ({
    label,
    status: 'pending',
  }))
  await update($, view, () => ({
    id,
    trigger,
    title: TITLES[trigger],
    steps,
    phase: 'working',
    isDismissed: false,
  }))

  const mark = async (i: number, status: HandoffStep['status'], detail?: string) => {
    await patch($, id, v => ({
      ...v,
      steps: v.steps.map((s, n) => (n === i ? { ...s, status, detail } : s)),
    }))
    $.ui.invalidate('ui.render')
  }

  let step = 0
  try {
    // 1. Read the conversation
    await mark(0, 'running')
    const found = await $.session.messages()
    if ('deny' in found) throw new Error('the conversation cannot be read')
    const messages = found
    if (messages.length === 0) throw new Error('the conversation is empty')
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd()
    const model = await $.session.model()
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const tokens = usage.context.tokens
    await mark(
      0,
      'done',
      `${messages.length} messages${tokens ? `, ${Math.round(tokens / 1000)}k tokens` : ''}`,
    )

    // 2. Files
    step = 1
    await mark(1, 'running')
    const read = new Map<string, number>()
    const changed = new Map<string, number>()
    for (const m of messages) {
      for (const use of m.toolUses) {
        const file = fileOf(use.input)
        if (file === undefined) continue
        if (WRITE_TOOLS.has(use.tool)) {
          changed.set(file, (changed.get(file) ?? 0) + 1)
        } else if (READ_TOOLS.has(use.tool)) {
          read.set(file, (read.get(file) ?? 0) + 1)
        }
      }
    }
    for (const file of changed.keys()) read.delete(file)
    await mark(1, 'done', `${changed.size} changed, ${read.size} read`)

    // 3. Skills, tools, links
    step = 2
    await mark(2, 'running')
    const tools = new Map<string, number>()
    const skills = new Map<string, number>()
    const links = new Set<string>()
    const linkRe = /https?:\/\/[^\s)>\]"'`\\]+/g
    const addLinks = (text: string) => {
      for (const raw of text.match(linkRe) ?? []) {
        links.add(raw.replace(/[.,;:!?]+$/, ''))
      }
    }
    for (const m of messages) {
      addLinks(m.text)
      for (const use of m.toolUses) {
        tools.set(use.tool, (tools.get(use.tool) ?? 0) + 1)
        if (use.tool === 'Skill' && typeof use.input.skill === 'string') {
          skills.set(use.input.skill, (skills.get(use.input.skill) ?? 0) + 1)
        }
        addLinks(JSON.stringify(use.input))
      }
    }
    await mark(
      2,
      'done',
      `${skills.size} skills, ${tools.size} tools, ${links.size} links`,
    )

    // 4. Write the handoff
    step = 3
    await mark(3, 'running', 'asking the model for a summary, can take a minute')
    const userAsks = messages
      .filter(m => m.role === 'user' && m.text.trim() !== '')
      .map(m => clip(m.text.trim().replace(/\s+/g, ' '), 300))
    const ask = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `- \`${k}\`${n > 1 ? ` (x${n})` : ''}`)
        .join('\n') || '- none'

    let narrative = ''
    const summaryPrompt =
      'Write a handoff summary of this session for a fresh session that will continue the work. ' +
      'Use exactly these sections as markdown headings: Goal, Current state, Decisions and why, ' +
      'Open problems, Next steps (numbered, concrete, in order). Name real files and commands. ' +
      'Facts only from this conversation, no preamble, at most 450 words. Do not call tools.'
    const forked = await Promise.race([
      $.model.fork({ prompt: summaryPrompt }),
      $.clock.sleep(120000).then(() => null),
    ]).catch(() => null)
    if (forked && forked.isAnswered && forked.text.trim() !== '') {
      narrative = forked.text.trim()
    } else {
      narrative =
        '## Goal\n(The model summary was unavailable; these are the last requests.)\n\n' +
        '## Recent requests\n' +
        userAsks
          .slice(-6)
          .map((t, i) => `${i + 1}. ${t}`)
          .join('\n') +
        '\n\n## Next steps\n1. Re-read the files below, then continue from the last request.'
    }

    const fileList = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([f, n]) => `- \`${f}\`${n > 1 ? ` (x${n})` : ''}`)
        .join('\n') || '- none'

    const dir = `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'}/.claude/handoffs`
    const base = `${dir}/${stamp(now)}-${sessionId.slice(0, 8)}`
    const path = `${base}.md`
    const promptPath = `${base}.prompt.txt`
    const prompt =
      `Continue the work of a previous session. First read the handoff file at ${path} ` +
      `(working directory: ${cwd}), re-read the files it lists as changed, then carry on ` +
      `with its "Next steps" without restarting from scratch. Ask me only if something is ambiguous.`

    const doc = [
      `# Handoff: ${new Date(now).toISOString()}`,
      '',
      `- Session: \`${sessionId}\``,
      `- Working directory: \`${cwd}\``,
      `- Model: ${model}`,
      `- Context at handoff: ${tokens ? `${tokens} tokens` : 'unknown'} of ${usage.context.window}`,
      `- Trigger: ${trigger}`,
      '',
      narrative,
      '',
      '## Files changed',
      fileList(changed),
      '',
      '## Files read',
      fileList(read),
      '',
      '## Skills used',
      ask(skills),
      '',
      '## Tools used',
      ask(tools),
      '',
      '## Links',
      [...links].slice(0, 40).map(l => `- ${l}`).join('\n') || '- none',
      '',
      '## Recent user requests',
      userAsks
        .slice(-6)
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n') || '- none',
      '',
    ].join('\n')
    await mark(
      3,
      'done',
      forked && forked.isAnswered ? 'summary by the model' : 'summary from last requests',
    )

    // 5. Save
    step = 4
    await mark(4, 'running')
    await $.fs.write(path, doc)
    await $.fs.write(promptPath, prompt)
    await patch($, id, v => ({ ...v, path, promptPath, prompt, cwd }))
    await mark(4, 'done', path)

    // 6. Check
    step = 5
    await mark(5, 'running')
    const back = await $.fs.read(path)
    const back2 = await $.fs.read(promptPath)
    if (
      typeof back !== 'string' ||
      back.length !== doc.length ||
      !back.includes('## Recent user requests') ||
      typeof back2 !== 'string' ||
      back2 !== prompt
    ) {
      throw new Error('the saved file does not match what was written')
    }
    await mark(5, 'done', `${back.length} characters verified`)
    await patch($, id, v => ({ ...v, phase: 'ready' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await patch($, id, v => ({
      ...v,
      phase: 'failed',
      steps: v.steps.map((s, n) =>
        n === step ? { ...s, status: 'error', detail: message } : s,
      ),
    }))
  } finally {
    isRunning = false
  }
}

const isWindows = async ($: Engine) =>
  (await $.env.get('OS')) === 'Windows_NT'


export const register: Register = on => {
  // The handoff runs on its own this many minutes before the prompt cache goes cold.
  const ttl = 60
  const runBefore = 5
  const threshold = 250000

  let cacheTimer: { cancel: () => void } | null = null
  let isContextArmed = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff-session',
      description: 'Write a handoff file so a new chat can continue this session',
    })
    return next(e)
  })

  on('command.run', { command: 'handoff-session' }, async $ => {
    if (isRunning) return { text: 'A handoff is already being written.' }
    void runHandoff($, 'command')
    return { text: 'Writing the handoff. Progress is shown above the prompt.' }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      cacheTimer?.cancel()
      cacheTimer = null
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    // Trigger 2: the cache goes cold `runBefore` minutes from now.
    cacheTimer?.cancel()
    const wait = Math.max(1, ttl - runBefore) * 60000
    cacheTimer = $.clock.after(wait, () => {
      cacheTimer = null
      void (async () => {
        if (isRunning) return
        const current = await read($, view)
        if (current && !current.isDismissed) return
        await runHandoff($, 'cache')
      })()
    })

    // Trigger 3: the context passes the threshold (re-armed once it falls).
    const { context } = await $.session.usage()
    const tokens = context.tokens ?? 0
    if (tokens < threshold * 0.8) isContextArmed = true
    if (isContextArmed && tokens > threshold) {
      isContextArmed = false
      void runHandoff($, 'context')
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (e.props.hasSurvey || current === null || current.isDismissed) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const rest = await next(e)
    const isReady = current.phase === 'ready'
    const mark = (s: HandoffStep) =>
      s.status === 'done' ? '✓' : s.status === 'error' ? '✗' : s.status === 'running' ? '…' : '·'

    const needReady = (act: () => void | Promise<void>) => () => {
      if (!isReady) {
        $.ui.toast('The handoff is not saved yet.')
        return
      }
      return act()
    }

    const mine = (
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>
          Session handoff: {current.title}
          {current.phase === 'failed' ? ' (failed)' : ''}
        </Text>
        {current.steps.map((s, i) => (
          <Text key={`s${i}`} dimColor={s.status === 'pending'}>
            {i + 1}.{' '}
            <Text color={s.status === 'done' ? 'green' : s.status === 'error' ? 'red' : undefined}>
              {mark(s)}
            </Text>{' '}
            {s.label}
            {s.detail ? ` — ${s.detail}` : ''}
          </Text>
        ))}
        <Box marginTop={1}>
          <Button
            key="copy"
            label="Copy prompt"
            variant="primary"
            onPress={needReady(async () => {
              const text = await $.fs.read(current.path ?? '')
              const r = await $.ui.copy({ text: String(text), surface: e.surface })
              $.ui.toast(r.isCopied ? 'Handoff copied.' : 'Could not copy the handoff.')
            })}
          />
          {e.surface === 'desktop' && <Text> </Text>}
          {e.surface === 'desktop' && (
            <Button
              key="new"
              label="Start a new chat with it"
              onPress={needReady(async () => {
                const text = String(await $.fs.read(current.path ?? ''))
                // The app takes at most 14,336 characters of prompt; a longer
                // handoff is passed by path instead.
                const q = text.length <= 8000 ? text : current.prompt ?? ''
                const url =
                  'claude://code/new?q=' +
                  encodeURIComponent(q).replace(/'/g, '%27') +
                  '&folder=' +
                  encodeURIComponent(current.cwd ?? '').replace(/'/g, '%27')
                if (!(await isWindows($))) {
                  await $.process.run(['open', url])
                } else {
                  await $.process.run([
                    'powershell',
                    '-NoProfile',
                    '-Command',
                    `Start-Process -FilePath '${url}'`,
                  ])
                }
                $.ui.toast('Opening a new chat in Claude.')
              })}
            />
          )}
          <Text> </Text>
          <Button
            key="open"
            label="Open file"
            onPress={needReady(async () => {
              const path = current.path ?? ''
              if (await isWindows($)) {
                await $.process.run(['cmd', '/c', 'start', '', path])
              } else {
                const home = (await $.env.get('HOME')) ?? ''
                await $.process.run([home.startsWith('/Users/') ? 'open' : 'xdg-open', path])
              }
            })}
          />
          <Text> </Text>
          <Button
            key="close"
            label="Close"
            role="dismiss"
            onPress={async () => {
              await update($, view, v => (v ? { ...v, isDismissed: true } : v))
              const files = [current.path, current.promptPath].filter(
                (f): f is string => typeof f === 'string',
              )
              if (current.phase === 'working' || files.length === 0) return
              const argv = (await isWindows($))
                ? ['cmd', '/c', 'del', '/f', '/q', ...files.map(f => f.replaceAll('/', '\\'))]
                : ['rm', '-f', ...files]
              const r = await $.process.run(argv).catch(() => null)
              $.ui.toast(
                r && r.exitCode === 0 ? 'Handoff file deleted.' : 'Could not delete the handoff file.',
              )
            }}
          />
        </Box>
      </Box>
    )

    // Pass control on, so other mods' bands draw too.
    return <Box flexDirection="column">{rest}{mine}</Box>
  })
}
