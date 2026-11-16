// What a mod declares, as the engine reports it: `claude plugin validate --json` analyses each hooks module
// and says which slash command it registers and which panes it opens. Switchboard reads that report, never source text.

// The two ports: the CLI, and a file in a mod's install folder (undefined when it cannot be read).
export type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
export type Read = (path: string) => Promise<string | undefined>

export type ListedMod = {
  id: string
  version: string
  isEnabled: boolean
  description: string
  lucide?: string
  iconSvg?: string
  command?: string
  panes: string[]
}

export type Listed = { mods: ListedMod[] } | { error: string }

type Plugin = { id: string; version: string; enabled: boolean; installPath: string }
type Report = { contents?: { type?: string; notes?: string[] }[] }

// The engine's wording for a command a hooks module runs, and for a Pane it draws.
const COMMAND = /command\.run\{command=([^}]+)\}/
const PANE = /ui\.render\{component=Pane, requestId=([^}]+)\}/g

// What the report says a mod declares. Undefined when the report has no hooks module: not a mod.
const declaredOf = (report: unknown): { command?: string; panes: string[] } | undefined => {
  const hooks = (report as Report | null)?.contents?.filter(c => c.type === 'hooks')
  if (!hooks?.length) return undefined
  const notes = hooks.flatMap(c => c.notes ?? [])
  const panes = new Set<string>()
  for (const note of notes) for (const m of note.matchAll(PANE)) if (m[1]) panes.add(m[1])

  return { command: notes.map(n => COMMAND.exec(n)?.[1]).find(Boolean), panes: [...panes] }
}

const parse = (text: string | undefined): unknown => {
  try {
    return text === undefined ? undefined : JSON.parse(text)
  } catch {
    return undefined
  }
}

// Every installed plugin that is a mod, sorted by id. A plugin that fails to validate is dropped.
export const listMods = async (run: Run, read: Read): Promise<Listed> => {
  const ran = await run(['claude', 'plugin', 'list', '--json'])
  if (ran.exitCode !== 0) return { error: `List failed: ${ran.stderr.slice(0, 120)}` }
  const plugins = parse(ran.stdout) as Plugin[] | undefined
  if (!Array.isArray(plugins)) return { error: 'List failed: not JSON' }

  const found = await Promise.all(plugins.map(p => modOf(p, run, read)))

  return { mods: found.filter((m): m is ListedMod => m !== undefined).sort((a, b) => a.id.localeCompare(b.id)) }
}

const modOf = async (p: Plugin, run: Run, read: Read): Promise<ListedMod | undefined> => {
  const checked = await run(['claude', 'plugin', 'validate', '--json', p.installPath])
  const declared = checked.exitCode === 0 ? declaredOf(parse(checked.stdout)) : undefined
  if (!declared) return undefined

  const manifest = (parse(await read(`${p.installPath}/.claude-plugin/plugin.json`)) ?? {}) as { description?: string; lucide?: string; icon?: string }
  const svg = await read(`${p.installPath}/icon.svg`)

  return {
    id: p.id,
    version: p.version,
    isEnabled: p.enabled,
    description: manifest.description ?? '',
    lucide: manifest.lucide ?? manifest.icon,
    iconSvg: svg?.includes('<svg') ? svg : undefined,
    command: declared.command,
    panes: declared.panes,
  }
}
