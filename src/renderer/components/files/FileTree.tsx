import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { buildTree, type TreeNode } from './fileTreeUtil'
import { getFileIcon } from './fileIcons'

interface Props {
  cwd: string
  onOpenFile: (relativePath: string) => void
  activeFilePath?: string | null
}

export function FileTree({ cwd, onOpenFile, activeFilePath }: Props) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setFiles(null)
    setError(null)
    window.api.files
      .list(cwd)
      .then((list) => {
        if (!cancelled) setFiles(list)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [cwd])

  const filteredPaths = useMemo(() => {
    if (!files) return []
    if (!filter.trim()) return files
    const q = filter.toLowerCase()
    return files.filter((f) => f.toLowerCase().includes(q))
  }, [files, filter])

  const tree = useMemo(() => buildTree(filteredPaths), [filteredPaths])

  const refresh = () => {
    setFiles(null)
    void window.api.files.list(cwd).then(setFiles).catch((e) => setError((e as Error).message))
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          explorer
        </span>
        <button
          onClick={refresh}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="refresh"
        >
          <RefreshCw size={12} strokeWidth={2.5} />
        </button>
      </header>
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1">
        {files === null && !error && (
          <div className="px-3 py-2 text-xs italic text-zinc-600">scanning…</div>
        )}
        {error && (
          <div className="m-2 rounded border border-red-900 bg-red-950/30 px-2 py-1 text-xs text-red-300">
            {error}
          </div>
        )}
        {files !== null && tree.children.length === 0 && (
          <div className="px-3 py-2 text-xs italic text-zinc-600">
            {filter ? 'no matches' : 'empty project'}
          </div>
        )}
        {tree.children.map((node) => (
          <TreeNodeView
            key={node.path}
            node={node}
            depth={0}
            activePath={activeFilePath}
            onOpenFile={onOpenFile}
            initiallyExpanded={!!filter}
          />
        ))}
      </div>
    </div>
  )
}

interface NodeProps {
  node: TreeNode
  depth: number
  activePath?: string | null
  onOpenFile: (path: string) => void
  initiallyExpanded?: boolean
}

function TreeNodeView({ node, depth, activePath, onOpenFile, initiallyExpanded }: NodeProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded || depth === 0)

  useEffect(() => {
    if (initiallyExpanded) setExpanded(true)
  }, [initiallyExpanded])

  const isActive = node.isFile && node.path === activePath
  const indent = depth * 10 + 6

  if (node.isFile) {
    const { icon: Icon, color } = getFileIcon(node.name)
    return (
      <button
        onClick={() => onOpenFile(node.path)}
        className={
          'group flex w-full items-center gap-1.5 truncate py-[3px] pr-2 text-left text-[12px] leading-tight transition-colors ' +
          (isActive
            ? 'bg-zinc-800/80 text-zinc-100'
            : 'text-zinc-300 hover:bg-zinc-900')
        }
        style={{ paddingLeft: indent }}
        title={node.path}
      >
        <Icon size={13} strokeWidth={1.75} className={`shrink-0 ${color}`} />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="group flex w-full items-center gap-1 truncate py-[3px] pr-2 text-left text-[12px] leading-tight text-zinc-200 hover:bg-zinc-900"
        style={{ paddingLeft: indent }}
      >
        <span className="flex h-3 w-3 shrink-0 items-center justify-center text-zinc-500">
          {expanded ? (
            <ChevronDown size={11} strokeWidth={2.25} />
          ) : (
            <ChevronRight size={11} strokeWidth={2.25} />
          )}
        </span>
        {expanded ? (
          <FolderOpen size={13} strokeWidth={1.75} className="shrink-0 text-zinc-400" />
        ) : (
          <Folder size={13} strokeWidth={1.75} className="shrink-0 text-zinc-400" />
        )}
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <TreeNodeView
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpenFile={onOpenFile}
            initiallyExpanded={initiallyExpanded}
          />
        ))}
    </div>
  )
}
