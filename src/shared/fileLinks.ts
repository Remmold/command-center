/** A file a link points at, with the lines or heading to show. */
export interface LinkedFile {
  path: string
  startLine?: number
  endLine?: number
  heading?: string
}

export type FileKind = 'image' | 'text' | 'other'

const KNOWN_FOLDERS = /^(src|lib|test|tests|dist|build|node_modules|components|utils|services|api|assets|public|private|config|scripts|docs)$/i
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const SYSTEM_EXTENSIONS = new Set([
  'pdf', 'zip', '7z', 'rar', 'gz', 'tar', 'tgz', 'exe', 'msi', 'dll', 'bin', 'iso',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt',
  'mp3', 'wav', 'ogg', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'bmp', 'ico', 'tif', 'tiff', 'psd', 'exr', 'hdr', 'tga',
  'fbx', 'obj', 'glb', 'gltf', 'blend', 'stl', 'unitypackage', 'uasset',
  'ttf', 'otf', 'woff', 'woff2', 'db', 'sqlite', 'pyc', 'class', 'jar', 'wasm'
])

/** The extension's `Z9t`: whether a link target looks like a file path rather than a word. */
function looksLikePath(p: string): boolean {
  return (
    p.startsWith('/') ||
    p.startsWith('./') ||
    p.startsWith('../') ||
    p.startsWith('.\\') ||
    p.startsWith('..\\') ||
    /\.[a-zA-Z0-9]{1,10}$/.test(p) ||
    p.endsWith('/') ||
    p.endsWith('\\') ||
    ((p.includes('/') || p.includes('\\')) && KNOWN_FOLDERS.test(p.split(/[/\\]/).pop() ?? ''))
  )
}

function isNetworkPath(p: string): boolean {
  return /^[\\/]{2}/.test(p) || p.includes('??')
}

/** The extension's `lW`: a path with an optional `:12`, `#L3-L9` or `#heading` after it. */
function splitTarget(target: string): LinkedFile | null {
  if (target.startsWith('//')) return null
  const lines = /^([^:#]+?)(?:[:#]L?(\d+)(?:-L?(\d+))?)?$/.exec(target)
  if (lines) {
    const [, path, start, end] = lines
    if (!looksLikePath(path)) return null
    return {
      path,
      ...(start ? { startLine: parseInt(start, 10) } : {}),
      ...(end ? { endLine: parseInt(end, 10) } : {})
    }
  }
  const heading = /^([^:#]+?)#([^#]+)$/.exec(target)
  if (heading && looksLikePath(heading[1]) && !isNetworkPath(heading[1])) return { path: heading[1], heading: heading[2] }
  return null
}

/** The extension's `r8e`: the decoded path, unless it is not a plain relative or rooted one. */
function decodePath(p: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(p)
  } catch {
    return null
  }
  // eslint-disable-next-line no-control-regex
  if (/[:\\\x00-\x1f\x7f-\x9f]/.test(decoded) || decoded.startsWith('//') || isNetworkPath(decoded)) return null
  return decoded
}

/** The file a Markdown link's href opens, by the extension's rules (`O8n`), or null for a web link or anything else. */
export function linkedFile(href: string): LinkedFile | null {
  const drive = /^(?:file:\/\/\/)?([a-z]):(?=[\\/]|%5c)/i.exec(href)
  const target = drive ? href.slice(drive[0].length).replace(/\\|%5c/gi, '/') : href
  const split = splitTarget(target)
  if (!split) return null
  const path = decodePath(split.path)
  if (path === null) return null
  return { ...split, path: drive ? `${drive[1]}:${path}` : path }
}

function extensionOf(path: string): string {
  const name = fileBaseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Images open in the preview, known binary formats in their own app, anything else in the editor. */
export function fileKind(path: string): FileKind {
  const ext = extensionOf(path)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return SYSTEM_EXTENSIONS.has(ext) ? 'other' : 'text'
}

export function fileBaseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
