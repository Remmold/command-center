import type { ContextItemKind, ContextLayerName } from '../../shared/context'
import type { MapBandName } from './mapLayout'

export const LANE_TITLES: Record<ContextLayerName, string> = { account: 'Account', repo: 'Repo', local: 'Local' }

export const BAND_TITLES: Record<MapBandName, string> = { start: 'Every start', 'on-demand': 'On demand', behaviour: 'Behaviour' }

export const BAND_NOTES: Record<MapBandName, string> = {
  start: 'Loads into every new chat.',
  'on-demand': 'Loads only when Claude needs it.',
  behaviour: 'Shapes what Claude may do; costs no tokens.'
}

export const KIND_TITLES: Record<ContextItemKind, string> = {
  'claude-md': 'CLAUDE.md',
  import: 'Imported file',
  'subfolder-claude-md': 'Subfolder CLAUDE.md',
  'memory-index': 'Memory index',
  'memory-file': 'Memory file',
  skill: 'Skill',
  agent: 'Agent',
  command: 'Command',
  'mcp-server': 'MCP server',
  plugin: 'Plugin',
  settings: 'Settings',
  hook: 'Hook'
}

export const SLASH_ONLY_SKILL = 'A skill offered only as a slash command: nothing of it loads at start, and its body loads when you type it.'

/** What each kind is and how Claude loads it, in plain words. */
export const KIND_EXPLANATIONS: Record<ContextItemKind, string> = {
  'claude-md': 'Standing instructions. Claude reads the whole file at the start of every chat.',
  import: 'A file a CLAUDE.md pulls in with @path. It loads with that CLAUDE.md, at every start.',
  'subfolder-claude-md': 'Instructions for one folder. Claude reads it only when it works with files in that folder.',
  'memory-index': 'MEMORY.md, the index of this workspace’s memory. It loads at every start, so Claude knows which memory files exist.',
  'memory-file': 'One remembered fact or rule. Claude opens it only when the index points it there.',
  skill: 'Skills: only the name and description load at start; the body loads when the skill is used.',
  agent: 'Agents: only the name and description load at start; the body loads when Claude starts that agent.',
  command: 'A slash command. Its text loads only when you type it.',
  'mcp-server': 'A server that gives Claude extra tools. It decides what Claude can reach; its tools are not counted here.',
  plugin: 'A bundle of skills, agents, commands or hooks. What it adds is drawn as its own blocks.',
  settings: 'Permissions and options for Claude in this layer. They shape what Claude may do and cost no tokens.',
  hook: 'A command that runs on an event, such as before a tool runs. It costs no tokens unless it prints into the chat.'
}
