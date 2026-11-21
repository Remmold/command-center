export interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: TreeNode[]
}

export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] }
  const dirCache = new Map<string, TreeNode>()
  dirCache.set('', root)

  for (const path of paths) {
    const parts = path.split('/')
    let parentPath = ''
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const fullPath = parentPath ? `${parentPath}/${name}` : name
      const isLast = i === parts.length - 1
      let node = dirCache.get(fullPath)
      if (!node) {
        node = { name, path: fullPath, isFile: isLast, children: [] }
        const parent = dirCache.get(parentPath)
        if (parent) parent.children.push(node)
        if (!isLast) dirCache.set(fullPath, node)
      }
      parentPath = fullPath
    }
  }

  // Sort: dirs first, then files, alphabetical within each
  function sortNode(n: TreeNode): void {
    n.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
      return a.name.localeCompare(b.name)
    })
    for (const child of n.children) {
      if (!child.isFile) sortNode(child)
    }
  }
  sortNode(root)

  return root
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    xml: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'plaintext',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    psm1: 'powershell',
    sql: 'sql',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    dart: 'dart',
    lua: 'lua',
    r: 'r',
    pl: 'perl',
    pm: 'perl',
    proto: 'plaintext',
    dockerfile: 'dockerfile',
    txt: 'plaintext',
    log: 'plaintext',
    env: 'plaintext'
  }
  return map[ext] ?? 'plaintext'
}

export function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}
