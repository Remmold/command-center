import type { LucideIcon } from 'lucide-react'
import {
  Braces,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  File as FileIcon,
  GitBranch,
  Hash,
  Settings
} from 'lucide-react'

/**
 * Color + icon descriptor for a file. Color is a Tailwind class fragment.
 */
export interface FileIconDescriptor {
  icon: LucideIcon
  color: string // tailwind text-color class
}

const EXT: Record<string, FileIconDescriptor> = {
  // TypeScript family
  ts: { icon: FileCode2, color: 'text-sky-400' },
  tsx: { icon: FileCode2, color: 'text-sky-400' },
  mts: { icon: FileCode2, color: 'text-sky-400' },
  cts: { icon: FileCode2, color: 'text-sky-400' },
  // JavaScript family
  js: { icon: FileCode2, color: 'text-amber-300' },
  jsx: { icon: FileCode2, color: 'text-amber-300' },
  mjs: { icon: FileCode2, color: 'text-amber-300' },
  cjs: { icon: FileCode2, color: 'text-amber-300' },
  // Python
  py: { icon: FileCode2, color: 'text-emerald-400' },
  pyi: { icon: FileCode2, color: 'text-emerald-400' },
  ipynb: { icon: FileCode2, color: 'text-emerald-400' },
  // Web
  html: { icon: FileCode2, color: 'text-orange-400' },
  htm: { icon: FileCode2, color: 'text-orange-400' },
  css: { icon: Hash, color: 'text-blue-400' },
  scss: { icon: Hash, color: 'text-pink-400' },
  sass: { icon: Hash, color: 'text-pink-400' },
  less: { icon: Hash, color: 'text-blue-400' },
  // Data / config
  json: { icon: FileJson, color: 'text-yellow-400' },
  jsonc: { icon: FileJson, color: 'text-yellow-400' },
  yaml: { icon: Braces, color: 'text-rose-400' },
  yml: { icon: Braces, color: 'text-rose-400' },
  toml: { icon: Braces, color: 'text-rose-400' },
  xml: { icon: Braces, color: 'text-orange-400' },
  // Markdown / docs
  md: { icon: FileText, color: 'text-zinc-300' },
  markdown: { icon: FileText, color: 'text-zinc-300' },
  txt: { icon: FileText, color: 'text-zinc-400' },
  log: { icon: FileText, color: 'text-zinc-500' },
  rst: { icon: FileText, color: 'text-zinc-300' },
  // Systems languages
  go: { icon: FileCode2, color: 'text-cyan-400' },
  rs: { icon: FileCode2, color: 'text-orange-500' },
  java: { icon: FileCode2, color: 'text-red-400' },
  kt: { icon: FileCode2, color: 'text-purple-400' },
  c: { icon: FileCode2, color: 'text-blue-300' },
  h: { icon: FileCode2, color: 'text-blue-300' },
  cpp: { icon: FileCode2, color: 'text-blue-400' },
  cc: { icon: FileCode2, color: 'text-blue-400' },
  hpp: { icon: FileCode2, color: 'text-blue-400' },
  cs: { icon: FileCode2, color: 'text-violet-400' },
  rb: { icon: FileCode2, color: 'text-red-400' },
  php: { icon: FileCode2, color: 'text-indigo-400' },
  swift: { icon: FileCode2, color: 'text-orange-400' },
  dart: { icon: FileCode2, color: 'text-cyan-400' },
  lua: { icon: FileCode2, color: 'text-blue-300' },
  // Shell
  sh: { icon: FileTerminal, color: 'text-emerald-400' },
  bash: { icon: FileTerminal, color: 'text-emerald-400' },
  zsh: { icon: FileTerminal, color: 'text-emerald-400' },
  fish: { icon: FileTerminal, color: 'text-emerald-400' },
  ps1: { icon: FileTerminal, color: 'text-blue-300' },
  psm1: { icon: FileTerminal, color: 'text-blue-300' },
  cmd: { icon: FileTerminal, color: 'text-blue-300' },
  bat: { icon: FileTerminal, color: 'text-blue-300' },
  // Images
  png: { icon: FileImage, color: 'text-purple-300' },
  jpg: { icon: FileImage, color: 'text-purple-300' },
  jpeg: { icon: FileImage, color: 'text-purple-300' },
  gif: { icon: FileImage, color: 'text-purple-300' },
  webp: { icon: FileImage, color: 'text-purple-300' },
  svg: { icon: FileImage, color: 'text-amber-400' },
  ico: { icon: FileImage, color: 'text-purple-300' },
  bmp: { icon: FileImage, color: 'text-purple-300' },
  // Audio / video
  mp3: { icon: FileAudio, color: 'text-pink-300' },
  wav: { icon: FileAudio, color: 'text-pink-300' },
  ogg: { icon: FileAudio, color: 'text-pink-300' },
  flac: { icon: FileAudio, color: 'text-pink-300' },
  mp4: { icon: FileVideo, color: 'text-rose-300' },
  mov: { icon: FileVideo, color: 'text-rose-300' },
  webm: { icon: FileVideo, color: 'text-rose-300' },
  // Archives
  zip: { icon: FileArchive, color: 'text-zinc-400' },
  tar: { icon: FileArchive, color: 'text-zinc-400' },
  gz: { icon: FileArchive, color: 'text-zinc-400' },
  '7z': { icon: FileArchive, color: 'text-zinc-400' },
  rar: { icon: FileArchive, color: 'text-zinc-400' },
  // Lock / env
  lock: { icon: FileLock, color: 'text-zinc-500' },
  env: { icon: FileLock, color: 'text-yellow-500' },
  // Spreadsheets
  csv: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  tsv: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  xlsx: { icon: FileSpreadsheet, color: 'text-emerald-500' },
  // Database
  sql: { icon: FileType, color: 'text-blue-400' },
  db: { icon: FileType, color: 'text-zinc-400' },
  sqlite: { icon: FileType, color: 'text-zinc-400' }
}

// Special filenames take precedence over extension
const SPECIAL: Record<string, FileIconDescriptor> = {
  '.gitignore': { icon: GitBranch, color: 'text-zinc-500' },
  '.gitattributes': { icon: GitBranch, color: 'text-zinc-500' },
  '.gitkeep': { icon: GitBranch, color: 'text-zinc-500' },
  '.gitmodules': { icon: GitBranch, color: 'text-zinc-500' },
  '.editorconfig': { icon: Settings, color: 'text-zinc-500' },
  '.prettierrc': { icon: Settings, color: 'text-zinc-400' },
  '.eslintrc': { icon: Settings, color: 'text-violet-400' },
  '.npmrc': { icon: Settings, color: 'text-red-400' },
  '.env': { icon: FileLock, color: 'text-yellow-500' },
  'package.json': { icon: FileJson, color: 'text-red-400' },
  'package-lock.json': { icon: FileLock, color: 'text-zinc-500' },
  'tsconfig.json': { icon: FileJson, color: 'text-sky-400' },
  'readme.md': { icon: FileText, color: 'text-blue-300' },
  'license': { icon: FileText, color: 'text-yellow-400' },
  'dockerfile': { icon: FileCode2, color: 'text-cyan-400' },
  'makefile': { icon: FileCode2, color: 'text-zinc-300' }
}

const DEFAULT_FILE: FileIconDescriptor = { icon: FileIcon, color: 'text-zinc-500' }

export function getFileIcon(filename: string): FileIconDescriptor {
  const lower = filename.toLowerCase()
  if (SPECIAL[lower]) return SPECIAL[lower]
  // Handle dotfiles where the name itself maps (e.g. ".env.example" -> ".env")
  if (lower.startsWith('.')) {
    const base = lower.split('.').slice(0, 2).join('.')
    if (SPECIAL[base]) return SPECIAL[base]
  }
  const ext = lower.split('.').pop() ?? ''
  return EXT[ext] ?? DEFAULT_FILE
}
