// Read a mod's register.tsx as text. These patterns are a contract with every other mod: see the README.

export const commandNameOf = (source: string) => /command\.register\(\{\s*name:\s*'([^']+)'/.exec(source)?.[1]

// Pane ids the mod opens: a string id, or a const the id names.
export const panesOf = (source: string) => {
  const ids = [...source.matchAll(/ui\.open\(\{\s*id:\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))/g)]
    .map(m => m[1] ?? m[2] ?? new RegExp(`const ${m[3]}\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1])
    .filter((id): id is string => !!id)

  return [...new Set(ids)]
}
