import { describe, expect, it } from 'vitest'
import { buildRule, describeRule, moveRule, readRule, ruleRisk, type BuiltRule } from './permissionRules'

describe('a permission rule in plain words', () => {
  it('says what a Bash or PowerShell rule lets through', () => {
    expect(describeRule('allow', 'Bash')).toBe('Allow every Bash command')
    expect(describeRule('allow', 'Bash(*)')).toBe('Allow every Bash command')
    expect(describeRule('allow', 'Bash(git status:*)')).toBe('Allow Bash commands starting with git status')
    expect(describeRule('ask', 'Bash(git push *)')).toBe('Ask before Bash commands starting with git push')
    expect(describeRule('deny', 'Bash(git * --force)')).toBe('Never allow Bash commands matching git * --force')
    expect(describeRule('allow', 'Bash(npm test)')).toBe('Allow the Bash command npm test')
    expect(describeRule('allow', 'PowerShell')).toBe('Allow every PowerShell command')
    expect(describeRule('allow', 'PowerShell(Get-ChildItem *)')).toBe('Allow PowerShell commands starting with Get-ChildItem')
  })

  it('says what a file rule covers', () => {
    expect(describeRule('allow', 'Read')).toBe('Allow reading any file')
    expect(describeRule('deny', 'Read(./.env)')).toBe('Never allow reading files matching ./.env')
    expect(describeRule('ask', 'Edit(//c/projects/**)')).toBe('Ask before editing files matching //c/projects/**')
    expect(describeRule('allow', 'Write(src/**)')).toBe('Allow writing files matching src/**')
  })

  it('says which sites a web rule reaches', () => {
    expect(describeRule('allow', 'WebFetch')).toBe('Allow fetching any web page')
    expect(describeRule('allow', 'WebFetch(domain:*)')).toBe('Allow fetching pages from any website')
    expect(describeRule('allow', 'WebFetch(domain:github.com)')).toBe('Allow fetching pages from github.com')
    expect(describeRule('allow', 'WebSearch')).toBe('Allow web searches')
  })

  it('names the MCP server and tool', () => {
    expect(describeRule('allow', 'mcp__unity-mcp')).toBe('Allow every tool of the MCP server unity-mcp')
    expect(describeRule('allow', 'mcp__unity-mcp__*')).toBe('Allow every tool of the MCP server unity-mcp')
    expect(describeRule('ask', 'mcp__gitlab__save_note')).toBe('Ask before the tool save_note of the MCP server gitlab')
  })

  it('names the subagent, skill or other tool', () => {
    expect(describeRule('allow', 'Agent')).toBe('Allow every subagent')
    expect(describeRule('allow', 'Agent(Explore)')).toBe('Allow the Explore subagent')
    expect(describeRule('allow', 'Skill(tdd)')).toBe('Allow the skill tdd')
    expect(describeRule('allow', 'Workflow')).toBe('Allow the Workflow tool')
    expect(describeRule('deny', 'NotebookEdit(x.ipynb)')).toBe('Never allow the NotebookEdit tool for x.ipynb')
  })
})

describe('building a permission rule', () => {
  const built: [BuiltRule, string][] = [
    [{ tool: 'Bash', name: '', pattern: '' }, 'Bash'],
    [{ tool: 'Bash', name: '', pattern: 'git status *' }, 'Bash(git status *)'],
    [{ tool: 'PowerShell', name: '', pattern: 'Get-Date' }, 'PowerShell(Get-Date)'],
    [{ tool: 'Read', name: '', pattern: './.env' }, 'Read(./.env)'],
    [{ tool: 'Edit', name: '', pattern: '' }, 'Edit'],
    [{ tool: 'Write', name: '', pattern: 'src/**' }, 'Write(src/**)'],
    [{ tool: 'WebFetch', name: '', pattern: 'github.com' }, 'WebFetch(domain:github.com)'],
    [{ tool: 'WebSearch', name: '', pattern: '' }, 'WebSearch'],
    [{ tool: 'mcp', name: '', pattern: 'unity-mcp' }, 'mcp__unity-mcp'],
    [{ tool: 'mcp', name: '', pattern: 'gitlab__save_note' }, 'mcp__gitlab__save_note'],
    [{ tool: 'Agent', name: '', pattern: 'Explore' }, 'Agent(Explore)'],
    [{ tool: 'Skill', name: '', pattern: 'tdd' }, 'Skill(tdd)'],
    [{ tool: 'other', name: 'Workflow', pattern: '' }, 'Workflow'],
    [{ tool: 'other', name: 'NotebookEdit', pattern: 'x.ipynb' }, 'NotebookEdit(x.ipynb)']
  ]

  it('gives the rule text for a tool and pattern, and reads that text back to the same pick', () => {
    for (const [rule, text] of built) {
      expect(buildRule(rule)).toBe(text)
      expect(readRule(text)).toEqual(rule)
    }
  })

  it('reads any rule text back to the same text, including ones the builder has no tool for', () => {
    for (const text of ['Bash(git status:*)', 'WebFetch(domain:*)', 'WebFetch(https://x.com)', 'WebSearch(x)', 'Bash()', 'Task(Explore)', 'Read(', 'mcp__a__b__c']) {
      expect(buildRule(readRule(text))).toBe(text)
    }
  })

  it('trims the pattern and tool name typed', () => {
    expect(buildRule({ tool: 'Bash', name: '', pattern: '  git log * ' })).toBe('Bash(git log *)')
    expect(buildRule({ tool: 'other', name: ' Glob ', pattern: '' })).toBe('Glob')
  })
})

describe('the risk of an Allow rule', () => {
  it('warns for a rule that lets every shell command through, and for nothing narrower', () => {
    for (const text of ['Bash', 'Bash(*)', 'PowerShell', 'PowerShell(*)']) expect(ruleRisk(text)).toMatch(/without asking/)
    for (const text of ['Bash(git status:*)', 'Read', 'mcp__unity-mcp', 'WebFetch(domain:*)']) expect(ruleRisk(text)).toBeNull()
  })
})

describe('moving a permission rule', () => {
  it('takes it out of its list and adds it at the end of the other, changing only those two lists', () => {
    const lists = { allow: ['Read', 'Bash(git push *)'], ask: ['Edit'], deny: ['Read(./.env)'] }
    expect(moveRule(lists, 'Bash(git push *)', 'allow', 'ask')).toEqual({ allow: ['Read'], ask: ['Edit', 'Bash(git push *)'] })
  })

  it('starts a list that is not there yet, and does not repeat a rule the other list has', () => {
    expect(moveRule({ allow: ['Bash'], ask: undefined, deny: ['Bash'] }, 'Bash', 'allow', 'ask')).toEqual({ allow: [], ask: ['Bash'] })
    expect(moveRule({ allow: ['Bash'], ask: ['Bash'], deny: undefined }, 'Bash', 'allow', 'ask')).toEqual({ allow: [] })
  })
})
