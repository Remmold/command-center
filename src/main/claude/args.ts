import { THINKING_BUDGET, type ClaudeStartOptions } from '../../shared/types'

/** The CLI arguments of a hosted session after the launcher's own; `extraArgs` go last. */
export function claudeArgs(options: ClaudeStartOptions & { extraArgs?: readonly string[] }): string[] {
  const { model, effort, thinking, resumeSessionId, permissionMode, allowBypass, addDirs = [], extraArgs = [] } = options
  const args = [
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--replay-user-messages',
    '--permission-prompt-tool=stdio'
  ]
  if (!extraArgs.some((a) => a.startsWith('--setting-sources'))) args.push('--setting-sources', 'user,project,local')
  if (model) args.push('--model', model)
  if (effort) args.push('--effort', effort)
  if (thinking === false) args.push('--thinking=disabled')
  else args.push('--max-thinking-tokens', String(THINKING_BUDGET))
  if (resumeSessionId) args.push('--resume', resumeSessionId)
  if (permissionMode) args.push('--permission-mode', permissionMode)
  // The CLI refuses a later switch to bypass unless the launch allowed it.
  if (allowBypass || permissionMode === 'bypassPermissions') args.push('--allow-dangerously-skip-permissions')
  for (const dir of addDirs) args.push('--add-dir', dir)
  return [...args, ...extraArgs]
}
