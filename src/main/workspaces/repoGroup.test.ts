import { describe, expect, it } from 'vitest'
import { deriveRepoGroup } from './repoGroup'

const FS_COMMON_DIR = 'C:/projects/personal/FantasySurvival/.git'

describe('repo group key', () => {
  it('is shared by the main checkout and its worktrees', () => {
    const main = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FantasySurvival',
      gitCommonDir: FS_COMMON_DIR
    })
    const shard = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FS-shard-2',
      gitCommonDir: FS_COMMON_DIR
    })
    const wt = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FS-wt-10-combat',
      gitCommonDir: 'c:\\projects\\personal\\FantasySurvival\\.git\\'
    })
    expect(shard.repoGroupKey).toBe(main.repoGroupKey)
    expect(wt.repoGroupKey).toBe(main.repoGroupKey)
  })

  it('differs between two repos', () => {
    const fs = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FantasySurvival',
      gitCommonDir: FS_COMMON_DIR
    })
    const cc = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\command-center',
      gitCommonDir: 'C:/projects/personal/command-center/.git'
    })
    expect(cc.repoGroupKey).not.toBe(fs.repoGroupKey)
  })

  it('resolves a relative common dir against the workspace', () => {
    const relative = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FantasySurvival',
      gitCommonDir: '.git'
    })
    const shard = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FS-shard-1',
      gitCommonDir: FS_COMMON_DIR
    })
    expect(relative.repoGroupKey).toBe(shard.repoGroupKey)
  })

  it('gives each folder outside git its own group', () => {
    const builds = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FS-builds',
      gitCommonDir: null
    })
    const other = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\notes',
      gitCommonDir: null
    })
    expect(builds.repoGroupKey).not.toBe(other.repoGroupKey)
    expect(builds.repoName).toBe('FS-builds')
    expect(builds.worktreeTag).toBe('')
  })
})

describe('repo name', () => {
  it('is the folder holding the shared .git, for every worktree', () => {
    const shard = deriveRepoGroup({
      workspacePath: 'C:\\projects\\personal\\FS-shard-3',
      gitCommonDir: FS_COMMON_DIR
    })
    expect(shard.repoName).toBe('FantasySurvival')
  })

  it('drops the .git suffix of a bare repo', () => {
    const wt = deriveRepoGroup({
      workspacePath: 'D:\\work\\tool-feature',
      gitCommonDir: 'D:/work/tool.git'
    })
    expect(wt.repoName).toBe('tool')
  })
})

describe('worktree tag', () => {
  const tagOf = (folder: string, commonDir = FS_COMMON_DIR): string =>
    deriveRepoGroup({ workspacePath: `C:\\projects\\personal\\${folder}`, gitCommonDir: commonDir })
      .worktreeTag

  it('is empty for the main checkout', () => {
    expect(tagOf('FantasySurvival')).toBe('')
  })

  it('strips the repo folder name and the separator after it', () => {
    expect(tagOf('FantasySurvival-ground')).toBe('ground')
  })

  it('strips the repo name initials for FS-shard-* and FS-wt-* worktrees', () => {
    expect(tagOf('FS-shard-1')).toBe('shard-1')
    expect(tagOf('FS-shard-2')).toBe('shard-2')
    expect(tagOf('FS-shard-4')).toBe('shard-4')
    expect(tagOf('FS-wt-10-combat')).toBe('wt-10-combat')
  })

  it('does not strip a prefix that runs into the rest of a word', () => {
    expect(tagOf('FSharp-tests')).toBe('FSharp-tests')
    expect(tagOf('FantasySurvivalist')).toBe('FantasySurvivalist')
  })

  it('keeps a folder named just the initials, so it is not mistaken for the main checkout', () => {
    expect(tagOf('FS')).toBe('FS')
  })

  it('keeps the whole folder name when it shares nothing with the repo name', () => {
    expect(tagOf('experiments')).toBe('experiments')
  })
})
