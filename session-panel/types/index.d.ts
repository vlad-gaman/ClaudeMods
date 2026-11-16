// `name`: the connector's display name as the engine lists it, when it could be read.
export type IconRow = { server: string; paths: string[]; name?: string }
export type Used = { server: string; count: number; tool?: string }
export type SkillRow = { name: string; count: number; desc: string }
export type FileRow = { path: string; type: string; tokens: number }
export type Todo = { id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }

declare module 'claude-code' {
  interface PluginState {
    'session-panel': {
      used: Shaped<Used[]>
      icons: Shaped<IconRow[]>
      skills: Shaped<SkillRow[]>
      files: Shaped<FileRow[]>
      todos: Shaped<Todo[]>
      title: Shaped<string>
      dismissed: Shaped<boolean>
    }
  }
}
