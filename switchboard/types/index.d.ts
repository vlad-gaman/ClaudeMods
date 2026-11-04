export type Mod = { id: string; version: string; isEnabled: boolean; desc?: string; command?: string; icon?: string; iconSvg?: string; panes?: string[] }

declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      mods: Shaped<Mod[]>
      note: Shaped<string>
      closed: Shaped<string[]>
    }
  }
}
