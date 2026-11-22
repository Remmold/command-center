import type { UserContentBlock } from '../../../shared/types'

// The extension's attachment rules (`sq`, `gYt`, `fqe`, `mqe`, `vYt`, `aq`, `gqe`, `C9`, `wzt` in webview/index.js).

export type AttachmentKind = 'image' | 'pdf' | 'text'

export interface PromptAttachment {
  kind: AttachmentKind
  mediaType: string
  base64: string
  name: string
}

export interface TerminalSnapshot {
  name: string
  contents: string
}

export const PROMPT_LIMIT = 50_000

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const TEXT_TYPES = [
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-javascript',
  'application/x-typescript',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/x-shellscript',
  'application/sql',
  'application/graphql',
  'application/toml',
  'application/x-toml'
]

const TEXT_EXTENSIONS = new Set(
  (
    'json yaml yml toml ini cfg conf config env properties js jsx ts tsx mjs cjs mts cts py pyw rb go rs java kt kts scala c h cpp hpp cc cxx cs fs fsx ' +
    'swift php pl pm lua r jl ex exs erl hrl clj cljs cljc elm hs ml mli v sv vhd vhdl asm s html htm xhtml xml svg css scss sass less vue svelte astro ' +
    'sh bash zsh fish ps1 psm1 psd1 bat cmd csv tsv sql graphql gql prisma md mdx markdown rst txt text rtf tex latex org adoc asciidoc makefile cmake ' +
    'gradle dockerfile containerfile vagrantfile rakefile gemfile podfile fastfile brewfile procfile lock sum log diff patch gitignore gitattributes ' +
    'editorconfig prettierrc eslintrc babelrc npmrc nvmrc yarnrc'
  ).split(' ')
)

const TEXT_NAMES = new Set(['license', 'readme', 'changelog', 'authors', 'contributors', 'copying'])

function isText(mediaType: string, name: string): boolean {
  if (mediaType.startsWith('text/') || TEXT_TYPES.includes(mediaType)) return true
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension && TEXT_EXTENSIONS.has(extension)) return true
  const lower = name.toLowerCase()
  return TEXT_EXTENSIONS.has(lower) || TEXT_NAMES.has(lower)
}

export function attachmentKind(mediaType: string, name: string): AttachmentKind | 'unsupported' {
  if (IMAGE_TYPES.includes(mediaType)) return 'image'
  if (mediaType === 'application/pdf') return 'pdf'
  return isText(mediaType, name) ? 'text' : 'unsupported'
}

export function unsupportedNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const listed = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
  return (
    `Unsupported file type${names.length > 1 ? 's' : ''}: ${listed}. Supported types: images (PNG, JPG, GIF, WebP), text files, and PDFs. ` +
    'To reference unsupported files, please include its absolute file path in your prompt (using @ for paths inside your working directory, and entering the path for files outside).'
  )
}

const TRUNCATED_SUFFIX = '\n\n[Message truncated - exceeded 50,000 character limit]'

/** Characters over the limit; the CLI's own truncation note does not count. */
export function overLimitBy(text: string): number {
  const length = text.endsWith(TRUNCATED_SUFFIX) ? text.length - TRUNCATED_SUFFIX.length : text.length
  return Math.max(0, length - PROMPT_LIMIT)
}

export function overLimitNotice(subject: string, over: number, advice: string): string {
  const count = over < 100_000 ? String(over) : over.toLocaleString('en-US')
  return `${subject} is ${count} ${over === 1 ? 'character' : 'characters'} over the limit of ${PROMPT_LIMIT} · ${advice}`
}

/** Names from `@terminal:<name>` in the prompt, in order. */
export function terminalMentions(text: string): string[] {
  return [...text.matchAll(/@terminal:([^\s]+)/g)].map((m) => m[1])
}

/** The contents of each `@terminal:<name>`, the name being a shell tab's label with `_` for spaces; unknown names are dropped. */
export function terminalSnapshots(
  text: string,
  shells: readonly { id: string; label: string }[],
  read: (id: string) => string | null
): TerminalSnapshot[] {
  return terminalMentions(text).flatMap((name) => {
    const shell = shells.find((s) => s.label.replace(/ /g, '_') === name)
    const contents = shell ? read(shell.id) : null
    return contents ? [{ name, contents }] : []
  })
}

function decodeText(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))
}

function attachmentBlock(a: PromptAttachment): UserContentBlock {
  if (a.kind === 'image') return { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.base64 } }
  if (a.kind === 'pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 }, title: a.name }
  return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: decodeText(a.base64) }, title: a.name }
}

/** The user message's `content`: attachments, then terminal contents, then the prompt text. */
export function promptContent(text: string, attachments: readonly PromptAttachment[], terminals: readonly TerminalSnapshot[]): UserContentBlock[] {
  const blocks: UserContentBlock[] = attachments.map(attachmentBlock)
  for (const t of terminals) blocks.push({ type: 'text', text: `<terminal name="${t.name}">\n${t.contents}\n</terminal>` })
  if (text.trim() !== '' || blocks.length === 0 || blocks.some((b) => b.type === 'text')) blocks.push({ type: 'text', text })
  return blocks
}
