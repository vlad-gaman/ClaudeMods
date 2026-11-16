/** The origin remote, parsed to the host that serves it and the slug or org, project and repo it names. */
export type Remote = { host: 'github'; slug: string } | { host: 'azure'; org: string; project: string; name: string }

const GITHUB = /(?:^|[@/])github\.com(?::\d+)?[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/i
const AZURE = [
  /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)\/?$/i,
  /\/\/(?:[^@/]+@)?([^./@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)\/?$/i,
  /(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i,
]

const decode = (part: string) => {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

export function remoteOf(url: string | null): Remote | null {
  if (!url) return null
  const slug = url.match(GITHUB)?.[1]
  if (slug) return { host: 'github', slug }
  for (const pattern of AZURE) {
    const match = url.match(pattern)
    if (match?.[1] && match[2] && match[3]) return { host: 'azure', org: decode(match[1]), project: decode(match[2]), name: decode(match[3]) }
  }
  return null
}
