import { ITEM_LISTS, isSettingsObject, keyPath, pathKeys, sameValue, type SettingsLayer, type SettingsObject, type SourceLayer } from './claudeSettings'
import { hooksLeftOut, readHookEvents } from './hooks'
import { isRuleList, ruleRisk } from './permissionRules'
import { statusLineLeftOut } from './statusLine'

export const SETTING_CATEGORIES = [
  'Model & thinking',
  'Permissions',
  'Hooks',
  'Interface',
  'Memory & context',
  'Git & attribution',
  'MCP servers',
  'Plugins & skills',
  'Agents & worktrees',
  'Remote & notifications',
  'Updates, privacy & sign-in',
  'Environment',
  'Key bindings',
  'Other keys'
] as const

export type SettingCategory = (typeof SETTING_CATEGORIES)[number]

export interface ChoiceOption {
  value: string
  label: string
  /** The layers this value counts in, when fewer than the setting's. */
  layers?: readonly SettingsLayer[]
}

export type SettingEditor = 'permissions' | 'hooks' | 'environment' | 'statusLine' | 'keyBindings' | 'otherKeys' | 'modelEffort'

export type SettingControl =
  | { kind: 'toggle' }
  | { kind: 'choice'; options: ChoiceOption[] }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'text'; placeholder?: string }
  | { kind: 'stringList' }
  | { kind: 'editor'; editor: SettingEditor }

export interface SettingEntry {
  /** Dot-separated path in the settings file. */
  key: string
  label: string
  description: string
  category: SettingCategory
  control: SettingControl
  /** What Claude uses when no layer sets the key; undefined when it depends on the model or plan. */
  default?: unknown
  /** Shown as "Default: …" instead of the formatted default. */
  defaultLabel?: string
  layers: readonly SettingsLayer[]
  /** Only Claude in a terminal reads it; the chats hosted here don't. */
  terminalOnly: boolean
  /** Claude reads it only when a chat starts. */
  newChatsOnly: boolean
  advanced: boolean
  /** A warning for a risky value, else null. */
  risk?: (value: unknown) => string | null
  /** An object Claude takes whole from the highest layer that sets it, instead of combining it per key. */
  whole?: boolean
  /** For an editor that shows only part of its value: the paths inside it, as keys, that it leaves out; `[]` is the whole value. */
  leavesOut?: (value: unknown) => string[][]
  /** The docs' exceptions: from the `from` layers, a value further along the ladder beats the value that would win. */
  stricter?: {
    /** Values from least to most strict; one value is enough when only it is the stricter one. */
    ladder: readonly unknown[]
    from: readonly SourceLayer[]
    /** The `from` layers count only with a stricter value than the other layers give. */
    onlyStricter?: boolean
  }
}

const ALL_LAYERS: readonly SettingsLayer[] = ['account', 'repo', 'local']
const ACCOUNT_ONLY: readonly SettingsLayer[] = ['account']
const NOT_REPO: readonly SettingsLayer[] = ['account', 'local']
const EVERY_SOURCE: readonly SourceLayer[] = ['organisation', 'local', 'repo', 'account']
const NOT_REPO_SOURCES: readonly SourceLayer[] = ['organisation', 'local', 'account']
const REPO_AND_LOCAL: readonly SourceLayer[] = ['local', 'repo']

export const LAYER_NAMES: Record<SourceLayer, string> = { organisation: 'Organisation', account: 'Account', repo: 'Repo', local: 'Local' }

export const layerList = (layers: readonly SourceLayer[]): string => {
  const names = layers.map((l) => LAYER_NAMES[l])
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Why a setting, or this value of it, does not count in the layer; null when it does. */
export function layerRule(entry: SettingEntry, layer: SettingsLayer, value?: unknown): string | null {
  if (!entry.layers.includes(layer)) return `Claude reads this only from ${layerList(entry.layers)} settings.`
  if (entry.control.kind !== 'choice') return null
  const option = entry.control.options.find((o) => o.value === value)
  if (option?.layers && !option.layers.includes(layer)) return `${option.label} counts only from ${layerList(option.layers)} settings; Claude ignores it here.`
  return null
}

/** Whether Claude reads `value` for this setting from the layer. */
export const countsIn = (entry: SettingEntry, layer: SourceLayer, value: unknown): boolean => layer === 'organisation' || layerRule(entry, layer, value) === null

const TOGGLE: SettingControl = { kind: 'toggle' }
const LIST: SettingControl = { kind: 'stringList' }
const TEXT: SettingControl = { kind: 'text' }
const OTHER_KEYS: SettingControl = { kind: 'editor', editor: 'otherKeys' }
const choice = (...options: [value: string, label: string][]): SettingControl => ({ kind: 'choice', options: options.map(([value, label]) => ({ value, label })) })
/** A key whose only value is the string "disable". */
const DISABLE = choice(['disable', 'Turned off'])

type Details = Partial<Omit<SettingEntry, 'key' | 'label' | 'description' | 'category' | 'control'>>

const inCategory =
  (category: SettingCategory) =>
  (key: string, label: string, description: string, control: SettingControl, details: Details = {}): SettingEntry => ({
    key,
    label,
    description,
    category,
    control,
    layers: ALL_LAYERS,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false,
    ...details
  })

const MODEL_OPTIONS: ChoiceOption[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'opus[1m]', label: 'Opus, 1M context' },
  { value: 'sonnet[1m]', label: 'Sonnet, 1M context' },
  { value: 'opusplan', label: 'Opus to plan, Sonnet to build' }
]

export const EFFORT_OPTIONS: ChoiceOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' }
]

const CACHE_TTL = choice(['5m', '5 minutes'], ['1h', '1 hour'])
const QUESTION_WAIT = choice(['60s', '1 minute'], ['5m', '5 minutes'], ['10m', '10 minutes'], ['never', 'Never'])

/** What the effort per model editor can't show: anything but a text `effortLevel` in an object per model. */
function notEffortLevels(value: unknown): string[][] {
  if (!isSettingsObject(value)) return [[]]
  return Object.entries(value).flatMap(([model, settings]) =>
    isSettingsObject(settings)
      ? Object.entries(settings).flatMap(([key, inner]) => (key === 'effortLevel' && typeof inner === 'string' ? [] : [[model, key]]))
      : [[model]]
  )
}

const model = inCategory('Model & thinking')
const MODEL_AND_THINKING: SettingEntry[] = [
  model('model', 'Model', 'The model new chats start on. The model picker in a chat saves its pick here too.', { kind: 'choice', options: MODEL_OPTIONS }, {
    defaultLabel: "Claude's default for your plan",
    newChatsOnly: true
  }),
  model('effortLevel', 'Default effort for models with no saved level', 'How hard a model thinks when you have saved no effort for it. Higher is more thorough, slower and costs more.', { kind: 'choice', options: EFFORT_OPTIONS }, {
    defaultLabel: "the model's own default",
    newChatsOnly: true
  }),
  model('modelSettings', 'Effort per model', 'The effort saved for each model. The effort picker in a chat saves here.', { kind: 'editor', editor: 'modelEffort' }, {
    defaultLabel: 'none saved',
    newChatsOnly: true,
    leavesOut: notEffortLevels
  }),
  model('alwaysThinkingEnabled', 'Extended thinking', 'Lets Claude think before it answers, in every chat.', TOGGLE, { defaultLabel: "the model's default", newChatsOnly: true }),
  model('fastMode', 'Fast mode', 'Faster answers at a higher price, on the models that offer it.', TOGGLE, { default: false }),
  model('language', 'Reply language', 'The language Claude answers in, written as a word such as japanese or french.', TEXT, { defaultLabel: 'English' }),
  model('outputStyle', 'Output style', "A saved set of instructions for Claude's tone and format, by name, such as Explanatory or Learning.", TEXT, { defaultLabel: 'the default style' }),
  model('modelPicker', 'Model picker list', 'Which models the model picker lists, in your order and with your labels.', OTHER_KEYS, {
    defaultLabel: 'the built-in list',
    layers: ACCOUNT_ONLY,
    advanced: true,
    whole: true
  }),
  model('maxEffortLevel', 'Effort cap', 'The highest effort a chat may use; a higher pick runs at the cap. When several layers set a cap, the lowest applies.', choice(['max', 'Max (no cap)'], ['xhigh', 'Extra high'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']), {
    defaultLabel: 'no cap',
    advanced: true,
    stricter: { ladder: ['max', 'xhigh', 'high', 'medium', 'low'], from: EVERY_SOURCE }
  }),
  model('advisorModel', 'Advisor model', 'The model Claude can ask for a second opinion. Not set turns the advisor off.', choice(['fable', 'Fable'], ['opus', 'Opus'], ['sonnet', 'Sonnet']), {
    defaultLabel: 'no advisor',
    advanced: true
  }),
  model('fallbackModel', 'Backup models', 'Models to try, in order, when the main model is overloaded or unavailable.', LIST, { defaultLabel: 'none', advanced: true }),
  model('availableModels', 'Allowed models', 'Only these models can be picked, for chats, subagents and skills.', LIST, { defaultLabel: 'every model', advanced: true }),
  model('enforceAvailableModels', 'Keep Default inside the allowed models', 'The Default model choice picks the first allowed model when it would land outside the list.', TOGGLE, { default: false, advanced: true }),
  model('fastModePerSessionOptIn', 'Turn on fast mode in each chat', 'Fast mode no longer starts on by itself; you turn it on with /fast in each chat.', TOGGLE, { default: false, advanced: true }),
  model('showThinkingSummaries', 'Full thinking summaries', 'Shows what Claude thought when you open its thinking, instead of a short collapsed line.', TOGGLE, { default: false, advanced: true }),
  model('switchModelsOnFlag', 'Switch models when a message is flagged', 'When a safety check flags a request, Claude goes on with a backup model instead of pausing to ask you.', TOGGLE, {
    defaultLabel: 'switch, sometimes asking first',
    advanced: true
  }),
  model('promptCacheTtl', 'Conversation cache time', 'How long the conversation stays cached. An hour survives longer breaks; each cache write costs more.', CACHE_TTL, {
    defaultLabel: "Claude's default",
    advanced: true
  }),
  model('subagentPromptCacheTtl', 'Helper cache time', 'The same for subagents, workflows and the requests Claude makes in the background.', CACHE_TTL, { defaultLabel: "Claude's default", advanced: true }),
  model('modelOverrides', 'Provider model ids', 'The id each model has at your cloud provider, such as Amazon Bedrock.', OTHER_KEYS, { defaultLabel: 'none', advanced: true }),
  model('ultracode', 'Start with ultracode', 'Claude plans a workflow for each larger task without being asked.', TOGGLE, { default: false, newChatsOnly: true, advanced: true })
]

const RULES: SettingControl = { kind: 'editor', editor: 'permissions' }
/** A list the rules editor can't show goes whole to Other keys. */
const notRules = (value: unknown): string[][] => (isRuleList(value) ? [] : [[]])
const RULE_LIST: Details = { defaultLabel: 'none', leavesOut: notRules }
const riskyAllowRule = (value: unknown): string | null => (Array.isArray(value) ? (value.map((rule) => (typeof rule === 'string' ? ruleRisk(rule) : null)).find(Boolean) ?? null) : null)

const permission = inCategory('Permissions')
const PERMISSIONS: SettingEntry[] = [
  permission(
    'permissions.defaultMode',
    'Permission mode',
    'The permission mode new chats start in.',
    {
      kind: 'choice',
      options: [
        { value: 'default', label: 'Ask before edits and commands' },
        { value: 'acceptEdits', label: 'Accept edits' },
        { value: 'plan', label: 'Plan first' },
        { value: 'dontAsk', label: 'Don’t ask, deny what isn’t allowed' },
        { value: 'auto', label: 'Auto', layers: ACCOUNT_ONLY },
        { value: 'bypassPermissions', label: 'Skip all permission prompts', layers: ACCOUNT_ONLY }
      ]
    },
    {
      default: 'default',
      newChatsOnly: true,
      risk: (value) => (value === 'bypassPermissions' ? 'Claude runs every tool without asking, including commands that delete or overwrite files.' : null)
    }
  ),
  permission('permissions.allow', 'Always allowed', 'Tool uses Claude runs without asking you.', RULES, { ...RULE_LIST, risk: riskyAllowRule }),
  permission('permissions.ask', 'Always ask', 'Tool uses that ask you first, even in a mode that would allow them.', RULES, RULE_LIST),
  permission('permissions.deny', 'Never allowed', 'Tool uses Claude may never make, such as reading files that hold secrets.', RULES, RULE_LIST),
  permission('permissions.additionalDirectories', 'Extra folders', 'Folders outside the workspace Claude may read and edit.', LIST, { defaultLabel: 'none' }),
  permission('permissions.blockReadsOutsideWorkingDirectories', 'Block reads outside the workspace', "Claude's file tools refuse to read outside the workspace folders, in every mode. On in any layer wins.", TOGGLE, {
    default: false,
    stricter: { ladder: [true], from: EVERY_SOURCE, onlyStricter: true }
  }),
  permission('permissions.blockWritesOutsideWorkingDirectories', 'Block writes outside the workspace', "Claude's file tools refuse to write outside the workspace folders, in every mode. On in any layer wins.", TOGGLE, {
    default: false,
    stricter: { ladder: [true], from: EVERY_SOURCE, onlyStricter: true }
  }),
  permission('skipDangerousModePermissionPrompt', 'Skip the bypass-mode warning', 'Starts in "skip all permission prompts" mode without asking you to confirm first.', TOGGLE, {
    default: false,
    layers: NOT_REPO,
    risk: (value) => (value === true ? 'Nothing asks before Claude starts with every permission prompt skipped.' : null)
  }),
  permission('permissions.denyInsteadOfPrompting', 'Deny instead of asking', 'Refuses a tool call that would otherwise wait for your approval.', TOGGLE, {
    default: false,
    layers: ACCOUNT_ONLY,
    advanced: true,
    stricter: { ladder: [true], from: ['account'] }
  }),
  permission('autoMode', 'Auto mode rules', 'Your own allow and deny rules for the auto mode safety check.', OTHER_KEYS, { defaultLabel: 'the built-in rules', layers: ACCOUNT_ONLY, advanced: true }),
  permission('autoMode.classifyAllShell', 'Check every shell command in auto mode', 'In auto mode every Bash and PowerShell command goes through the safety check, and your shell allow rules pause.', TOGGLE, {
    default: false,
    layers: ACCOUNT_ONLY,
    advanced: true,
    stricter: { ladder: [true], from: ['account'] }
  }),
  permission('useAutoModeDuringPlan', 'Auto mode while planning', 'The safety check reviews shell commands in plan mode; off asks you instead.', TOGGLE, {
    default: true,
    layers: NOT_REPO,
    advanced: true,
    stricter: { ladder: [false], from: NOT_REPO_SOURCES }
  }),
  permission('disableAutoMode', 'Turn off auto mode', 'Removes auto mode; a chat that would start in it starts asking as usual.', DISABLE, { defaultLabel: 'auto mode available', advanced: true }),
  permission('permissions.disableBypassPermissionsMode', 'Turn off skip-all-prompts mode', 'Nobody can start Claude with every permission prompt skipped.', DISABLE, { defaultLabel: 'available', advanced: true }),
  permission('skipAutoPermissionPrompt', 'Skip the auto mode notice', 'Skips the one-time explanation shown the first time you switch to auto mode.', TOGGLE, { default: false, layers: ACCOUNT_ONLY, advanced: true })
]

const hook = inCategory('Hooks')
const HOOKS: SettingEntry[] = [
  hook('hooks', 'Hooks', 'Your own commands that run at set moments, such as before a tool runs or when a chat starts.', { kind: 'editor', editor: 'hooks' }, { defaultLabel: 'none', leavesOut: hooksLeftOut }),
  hook('disableAllHooks', 'Turn off all hooks', 'Stops every hook, the status line and a custom file suggestion command, without deleting them.', TOGGLE, {
    default: false,
    risk: (value) => (value === true ? 'Every hook stops, including the ones that check or guard what Claude does.' : null)
  }),
  hook('enableWorkflows', 'Workflows', 'Lets Claude run a larger task as a workflow of several agents.', TOGGLE, { defaultLabel: 'on, except on the Pro plan' }),
  hook('workflowSizeGuideline', 'Workflow size', 'How many agents Claude aims for in a workflow. It is advice to Claude, not a hard limit.', choice(['unrestricted', 'As many as the task needs'], ['small', 'Small, under 5'], ['medium', 'Medium, under 10'], ['large', 'Large, under 50']), {
    defaultLabel: 'Medium (Small on the Pro plan)',
    advanced: true
  }),
  hook('workflowKeywordTriggerEnabled', 'Start a workflow with the word ultracode', 'Typing ultracode in a prompt starts a workflow.', TOGGLE, { default: true, advanced: true }),
  hook('disableWorkflows', 'Turn off workflows for everyone', 'Turns workflows off for everyone these settings reach, such as everyone on the repo.', TOGGLE, { default: false, advanced: true }),
  hook('allowedHttpHookUrls', 'Addresses web hooks may call', 'Web hooks run only when their address matches one of these patterns.', LIST, { defaultLabel: 'any address', advanced: true }),
  hook('httpHookAllowedEnvVars', 'Variables web hooks may send', 'Environment variables a web hook may put in its request.', LIST, { defaultLabel: "each hook's own list", advanced: true })
]

const ui = inCategory('Interface')
const TERMINAL_ONLY: Details = { terminalOnly: true }
const INTERFACE: SettingEntry[] = [
  ui('theme', 'Theme', "Claude's colours in the terminal.", choice(['auto', 'Match the terminal'], ['dark', 'Dark'], ['light', 'Light'], ['dark-daltonized', 'Dark, colour-blind friendly'], ['light-daltonized', 'Light, colour-blind friendly'], ['dark-ansi', 'Dark, terminal colours only'], ['light-ansi', 'Light, terminal colours only']), {
    default: 'dark',
    ...TERMINAL_ONLY
  }),
  ui('promptSuggestionEnabled', 'Prompt suggestions', 'Greyed-out guesses of your next prompt in the input box.', TOGGLE, { default: true }),
  ui('editorMode', 'Input keys', 'How the input box takes keys: as usual, or like the vim editor.', choice(['normal', 'Normal'], ['vim', 'Vim']), { default: 'normal', ...TERMINAL_ONLY }),
  ui('tui', 'Screen mode', 'Full screen without flicker, or the classic scrolling terminal.', choice(['default', 'Classic'], ['fullscreen', 'Full screen']), { defaultLabel: 'Claude picks', ...TERMINAL_ONLY }),
  ui('viewMode', 'Transcript view', 'How much of each step the transcript shows when Claude starts.', choice(['default', 'Short summaries'], ['verbose', 'Full tool output'], ['focus', 'Only your prompt and the answer']), {
    defaultLabel: 'your last choice',
    newChatsOnly: true,
    ...TERMINAL_ONLY
  }),
  ui('verbose', 'Full tool output', 'Shows everything each tool call took in and gave back, instead of a short summary.', TOGGLE, { default: false, ...TERMINAL_ONLY }),
  ui('statusLine', 'Status line', 'A command whose output shows as a line under the input box.', { kind: 'editor', editor: 'statusLine' }, { defaultLabel: 'none', leavesOut: statusLineLeftOut('statusLine'), ...TERMINAL_ONLY }),
  ui('showTurnDuration', 'Show how long each answer took', 'A line such as "Cooked for 1m 6s" after each answer.', TOGGLE, { default: true, ...TERMINAL_ONLY }),
  ui('spinnerTipsEnabled', 'Tips while Claude works', 'Short tips about Claude Code beside the spinner.', TOGGLE, { default: true, ...TERMINAL_ONLY }),
  ui('prefersReducedMotion', 'Reduce motion', 'Calms or stops animations such as the spinner and flashes.', TOGGLE, { default: false, ...TERMINAL_ONLY }),
  ui('defaultShell', 'Shell for ! commands', 'The shell that runs commands you type after ! in the input box.', choice(['bash', 'Bash'], ['powershell', 'PowerShell']), {
    defaultLabel: 'Bash, or PowerShell on Windows without Bash',
    ...TERMINAL_ONLY
  }),
  ui('respondToBashCommands', 'Reply after ! commands', 'Claude answers the output of a command you ran with !; off only adds the output.', TOGGLE, { default: true, ...TERMINAL_ONLY }),
  ui('askUserQuestionTimeout', 'Answer questions for me after', 'A question Claude asks with no answer goes on with the options already picked after this long.', QUESTION_WAIT, {
    default: 'never',
    layers: ACCOUNT_ONLY,
    advanced: true
  }),
  ui('dialogExpiry', 'Deadline for questions sent elsewhere', 'How long a question forwarded to a remote client, such as Remote Control, waits for an answer.', QUESTION_WAIT, {
    default: '5m',
    layers: ACCOUNT_ONLY,
    advanced: true
  }),
  ui('autoContinueAtUsageLimit', 'Go on after the usage limit resets', 'When a usage limit stops a chat, it waits and carries on by itself once the limit resets.', TOGGLE, {
    default: true,
    layers: ACCOUNT_ONLY,
    advanced: true,
    ...TERMINAL_ONLY
  }),
  ui('bashEditDiffEnabled', 'Track files shell commands change', 'Shows which files a shell command changed, and tells your hooks.', TOGGLE, {
    defaultLabel: 'only in auto and skip-all-prompts modes',
    advanced: true
  }),
  ui('axScreenReader', 'Screen reader mode', 'Plain text without borders or animations, for screen readers.', TOGGLE, { default: false, layers: ACCOUNT_ONLY, advanced: true, ...TERMINAL_ONLY }),
  ui('autoScrollEnabled', 'Follow new output', 'In full screen, the transcript scrolls along as Claude writes.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('wheelScrollAccelerationEnabled', 'Faster scrolling on quick wheel turns', 'In full screen, a fast turn of the mouse wheel scrolls further.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('syntaxHighlightingDisabled', 'Turn off code colours', 'Shows code and diffs as plain text.', TOGGLE, { default: false, advanced: true, ...TERMINAL_ONLY }),
  ui('emojiCompletionEnabled', 'Emoji shortcodes', 'Typing a code such as :heart: suggests and puts in the emoji.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('respectGitignore', 'Leave ignored files out of the @ picker', 'The @ file picker skips files git is told to ignore.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('fileSuggestion', 'File suggestion command', 'Your own command that fills the @ file picker.', OTHER_KEYS, { defaultLabel: 'the built-in picker', advanced: true, ...TERMINAL_ONLY }),
  ui('showClearContextOnPlanAccept', 'Offer to clear context on plan approval', 'Approving a plan can also clear the conversation and build from the plan alone.', TOGGLE, { default: false, advanced: true, ...TERMINAL_ONLY }),
  ui('maxProseWidth', 'Text width', 'The widest, in characters, a line of Claude’s text gets in a wide terminal.', { kind: 'number', min: 40 }, { defaultLabel: 'the terminal width', advanced: true, ...TERMINAL_ONLY }),
  ui('timeFormat', 'Time format', 'How times show, such as the time an answer finished.', choice(['auto', 'Automatic'], ['12-hour', '12-hour clock'], ['24-hour', '24-hour clock'], ['24-hour-utc', '24-hour clock in UTC']), {
    default: 'auto',
    advanced: true,
    ...TERMINAL_ONLY
  }),
  ui('timeZone', 'Time zone', 'The time zone times show in, such as Europe/Stockholm.', TEXT, { defaultLabel: 'your computer’s time zone', advanced: true, ...TERMINAL_ONLY }),
  ui('terminalProgressBarEnabled', 'Progress in the terminal tab', 'Terminals that can show progress on their tab or taskbar show when Claude is busy.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('terminalTitleFromRename', 'Tab title from the chat name', 'Once you name a chat, the terminal tab shows that name.', TOGGLE, { default: true, advanced: true, ...TERMINAL_ONLY }),
  ui('companyAnnouncements', 'Start-up announcements', 'Messages shown when Claude starts; with several, one at random.', LIST, { defaultLabel: 'none', advanced: true, ...TERMINAL_ONLY }),
  ui('spinnerTipsOverride', 'Your own tips', 'Tips to add to the spinner, or to show instead of the built-in ones.', OTHER_KEYS, { defaultLabel: 'the built-in tips', advanced: true, ...TERMINAL_ONLY }),
  ui('spinnerVerbs', 'Spinner words', 'Your own words for the spinner, such as "Baking", added to the built-in ones or instead of them.', OTHER_KEYS, {
    defaultLabel: 'the built-in words',
    advanced: true,
    ...TERMINAL_ONLY
  }),
  ui('footerLinksRegexes', 'Footer links', 'Turns ids that appear in the output, such as ticket numbers, into links under the input box.', OTHER_KEYS, {
    defaultLabel: 'none',
    layers: ACCOUNT_ONLY,
    advanced: true,
    ...TERMINAL_ONLY
  }),
  ui('spellcheck', 'Spell check', 'Underlines misspelt words in the input box, using a spell checker you install.', OTHER_KEYS, {
    defaultLabel: 'off',
    layers: ACCOUNT_ONLY,
    advanced: true,
    whole: true,
    ...TERMINAL_ONLY
  }),
  ui('voice.enabled', 'Voice dictation', 'Speak your prompt instead of typing it.', TOGGLE, { default: false, advanced: true, ...TERMINAL_ONLY }),
  ui('voice.mode', 'Dictation key', 'Hold the key while you speak, or tap it to start and again to send.', choice(['hold', 'Hold to speak'], ['tap', 'Tap to start and send']), { default: 'hold', advanced: true, ...TERMINAL_ONLY }),
  ui('voice.autoSubmit', 'Send when you let go', 'In hold mode, letting go of the key sends the prompt.', TOGGLE, { default: false, advanced: true, ...TERMINAL_ONLY }),
  ui('voiceEnabled', 'Voice dictation (older setting)', 'The older on/off for dictation; Voice dictation above wins when both are set.', TOGGLE, { defaultLabel: 'off', advanced: true, ...TERMINAL_ONLY }),
  ui('vimInsertModeRemaps', 'Vim escape keys', 'Two-key sequences, such as jk, that act as Escape in vim mode.', OTHER_KEYS, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true, ...TERMINAL_ONLY }),
  ui('subagentStatusLine', 'Subagent status line', 'A command whose output shows as the status line of subagents.', { kind: 'editor', editor: 'statusLine' }, {
    defaultLabel: 'none',
    advanced: true,
    leavesOut: statusLineLeftOut('subagentStatusLine'),
    ...TERMINAL_ONLY
  })
]

const memory = inCategory('Memory & context')
const MEMORY_AND_CONTEXT: SettingEntry[] = [
  memory('autoMemoryEnabled', 'Auto memory', 'Claude keeps notes about the project between chats and reads them back.', TOGGLE, { default: true }),
  memory('autoCompactEnabled', 'Compact automatically', 'Summarises the conversation when it nears the context limit, so the chat can go on.', TOGGLE, { default: true }),
  memory('fileCheckpointingEnabled', 'Rewind checkpoints', 'Saves each file before Claude edits it, so /rewind can bring it back.', TOGGLE, { default: true }),
  memory('claudeMdExcludes', 'CLAUDE.md files to skip', 'CLAUDE.md files Claude does not load, as full paths or patterns.', LIST, { defaultLabel: 'none' }),
  memory('autoCompactWindow', 'Compact at', 'How many tokens the conversation reaches before it is compacted, at least 100,000.', { kind: 'number', min: 100000 }, {
    defaultLabel: 'tuned for the model',
    advanced: true
  }),
  memory('idleCompaction', 'Compact while you are away', 'A long conversation you stepped away from is summarised, so your next message costs less.', TOGGLE, { default: true, advanced: true }),
  memory('autoMemoryDirectory', 'Auto memory folder', 'Where auto memory keeps its notes, as a full path or one starting with ~/.', TEXT, { defaultLabel: 'a folder per project in ~/.claude/projects', advanced: true }),
  memory('plansDirectory', 'Plans folder', 'Where plan mode saves its plans, relative to the project.', TEXT, { defaultLabel: '~/.claude/plans', advanced: true }),
  memory('bashOutputMaxChars', 'Command output Claude reads', 'How many characters of a command’s output Claude gets directly; the rest goes to a file.', { kind: 'number', min: 4000, max: 128000 }, {
    defaultLabel: '30000',
    advanced: true
  }),
  memory('skillListingBudgetFraction', 'Share of context for the skill list', 'The part of the context the list of skills may take, as a fraction such as 0.01 for 1%.', { kind: 'number', min: 0, max: 1 }, {
    default: 0.01,
    advanced: true
  }),
  memory('skillListingMaxDescChars', 'Skill description length', 'How many characters of each skill’s description Claude sees.', { kind: 'number', min: 1 }, { default: 1536, advanced: true })
]

const ENVIRONMENT: SettingEntry[] = [
  inCategory('Environment')('env', 'Environment variables', 'Variables set for every chat and for the commands Claude runs.', { kind: 'editor', editor: 'environment' }, { defaultLabel: 'none' })
]

const git = inCategory('Git & attribution')
const GIT_AND_ATTRIBUTION: SettingEntry[] = [
  git('attribution.commit', 'Commit sign-off', 'The text Claude adds to the commits it makes.', TEXT, { defaultLabel: 'Co-Authored-By: Claude <model>' }),
  git('attribution.pr', 'Pull request sign-off', 'The text Claude adds to the pull requests it writes.', TEXT, { defaultLabel: 'Generated with Claude Code' }),
  git('includeGitInstructions', 'Git instructions and status', 'Claude gets its built-in commit and pull request instructions and a snapshot of the git status.', TOGGLE, { default: true }),
  git('attribution.sessionUrl', 'Session link in commits', 'Commits and pull requests from a cloud or Remote Control chat link to it on claude.ai.', TOGGLE, { default: true, advanced: true }),
  git('includeCoAuthoredBy', 'Sign-off line (older setting)', 'The older on/off for the commit and pull request sign-off; the sign-off texts above win.', TOGGLE, { default: true, advanced: true }),
  git('prUrlTemplate', 'Pull request link address', 'Points pull request links at your own review tool, using {host}, {owner}, {repo}, {number} or {url}.', TEXT, {
    defaultLabel: 'github.com',
    advanced: true
  })
]

const mcp = inCategory('MCP servers')
const MCP_SERVERS: SettingEntry[] = [
  mcp('enableAllProjectMcpServers', 'Approve every project server', "Connects every server in a project's .mcp.json without asking.", TOGGLE, { default: false }),
  mcp('enabledMcpjsonServers', 'Approved project servers', "Servers from a project's .mcp.json that connect without asking.", LIST, { defaultLabel: 'none' }),
  mcp('disabledMcpjsonServers', 'Rejected project servers', "Servers from a project's .mcp.json that never connect.", LIST, { defaultLabel: 'none' }),
  mcp('disableClaudeAiConnectors', 'Turn off claude.ai connectors', 'Claude does not load the connectors you set up on claude.ai. On in any layer wins.', TOGGLE, {
    default: false,
    stricter: { ladder: [true], from: EVERY_SOURCE, onlyStricter: true }
  }),
  mcp('allowedMcpServers', 'Allowed servers', 'Only servers that match this list can be added.', OTHER_KEYS, { defaultLabel: 'every server', advanced: true }),
  mcp('deniedMcpServers', 'Blocked servers', 'Servers that match this list never load.', OTHER_KEYS, { defaultLabel: 'none', advanced: true })
]

const plugin = inCategory('Plugins & skills')
const PLUGINS_AND_SKILLS: SettingEntry[] = [
  plugin('enabledPlugins', 'Plugins on or off', 'Which installed plugins are turned on.', OTHER_KEYS, { defaultLabel: "each plugin's own default" }),
  plugin('syncClaudeAiSkills', 'Sync claude.ai skills', 'Downloads and loads the skills you have on claude.ai. Only off counts.', TOGGLE, {
    default: true,
    layers: NOT_REPO,
    newChatsOnly: true,
    stricter: { ladder: [false], from: NOT_REPO_SOURCES }
  }),
  plugin('syncClaudeAiPlugins', 'Sync claude.ai plugins', 'Downloads and loads the plugins you have on claude.ai. Only off counts.', TOGGLE, {
    default: true,
    layers: NOT_REPO,
    newChatsOnly: true,
    stricter: { ladder: [false], from: NOT_REPO_SOURCES }
  }),
  plugin('skillOverrides', 'Skill visibility', 'Hides a skill from Claude, or shows only its name, without editing the skill.', OTHER_KEYS, { defaultLabel: 'every skill shown', advanced: true }),
  plugin('extraKnownMarketplaces', 'Extra plugin marketplaces', 'Plugin marketplaces added for everyone these settings reach.', OTHER_KEYS, { defaultLabel: 'none', advanced: true }),
  plugin('disableBundledSkills', 'Turn off built-in skills', 'Removes the skills and workflows that come with Claude Code.', TOGGLE, { default: false, advanced: true }),
  plugin('disableSkillShellExecution', 'Stop commands inside skills', 'Shell commands written into skills and custom commands are not run.', TOGGLE, { default: false, advanced: true }),
  plugin('pluginConfigs', 'Plugin options', 'The answers you gave when a plugin asked for its options.', OTHER_KEYS, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true }),
  plugin('prependPlugins', 'Plugins whose mods run first', 'Managed plugins whose mods run before the ones you installed.', LIST, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true }),
  plugin('appendPlugins', 'Plugins whose mods run last', 'Managed plugins whose mods run after the ones you installed.', LIST, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true }),
  plugin('skippedPlugins', 'Plugins you declined', 'Plugins you chose not to install when asked.', LIST, { defaultLabel: 'none', advanced: true }),
  plugin('skippedMarketplaces', 'Marketplaces you declined', 'Plugin marketplaces you chose not to install when asked.', LIST, { defaultLabel: 'none', advanced: true })
]

const agents = inCategory('Agents & worktrees')
const AGENTS_AND_WORKTREES: SettingEntry[] = [
  agents('agent', 'Start as an agent', 'Chats start as this named agent, with its instructions, tools and model.', TEXT, { defaultLabel: 'none', newChatsOnly: true }),
  agents('worktree.baseRef', 'New worktrees start from', 'The clean main branch from the remote, or your current branch with its unpushed commits.', choice(['fresh', 'The remote’s main branch'], ['head', 'Your current branch']), {
    default: 'fresh'
  }),
  agents('worktree.symlinkDirectories', 'Folders shared into worktrees', 'Folders linked into each worktree instead of copied, such as node_modules.', LIST, { defaultLabel: 'none' }),
  agents('worktree.sparsePaths', 'Folders worktrees check out', 'Each worktree gets only these folders, which is faster in a large repo.', LIST, { defaultLabel: 'the whole repo', advanced: true }),
  agents('worktree.bgIsolation', 'Background chats edit in', 'Background chats edit in a worktree of their own, or straight in your folder.', choice(['worktree', 'Their own worktree'], ['none', 'Your folder']), {
    default: 'worktree',
    advanced: true,
    ...TERMINAL_ONLY
  }),
  agents('worktree.location', 'Worktree folder over SSH', 'Where the desktop app makes worktrees on a remote machine.', TEXT, { defaultLabel: 'inside the project', layers: ACCOUNT_ONLY, advanced: true, ...TERMINAL_ONLY }),
  agents('disableAgentView', 'Turn off background agents', 'Turns off claude agents, background chats and the agent view.', TOGGLE, { default: false, advanced: true, ...TERMINAL_ONLY }),
  agents('teammateMode', 'Where teammates show', 'Agent team members show inside your terminal, or in panes of their own.', choice(['in-process', 'In your terminal'], ['auto', 'Panes when the terminal can'], ['tmux', 'tmux panes'], ['iterm2', 'iTerm2 panes']), {
    default: 'in-process',
    advanced: true,
    ...TERMINAL_ONLY
  }),
  agents('crossSessionInbound', 'Messages from your other chats', 'What a chat does with a message one of your other chats sends it. Repo and Local count only when stricter.', choice(['accept', 'Pass it to Claude'], ['hold', 'Show it, held'], ['refuse', 'Drop it']), {
    defaultLabel: 'decided per message',
    advanced: true,
    stricter: { ladder: ['accept', 'hold', 'refuse'], from: REPO_AND_LOCAL, onlyStricter: true }
  }),
  agents('isolatePeerMachines', 'Ask before messages to other machines', 'Claude asks you before a message reaches one of your chats on another computer. On in any layer wins.', TOGGLE, {
    default: false,
    advanced: true,
    stricter: { ladder: [true], from: EVERY_SOURCE }
  }),
  agents('processWrapper', 'Launcher for background processes', 'A command placed in front of the processes Claude starts in the background (macOS and Linux).', TEXT, {
    defaultLabel: 'none',
    layers: ACCOUNT_ONLY,
    advanced: true
  })
]

const remote = inCategory('Remote & notifications')
const REMOTE_AND_NOTIFICATIONS: SettingEntry[] = [
  remote('remoteControlAtStartup', 'Remote Control at start', 'Each chat connects to claude.ai/code as it starts, so you can follow it from the web or your phone. Repo and Local can only turn it off.', TOGGLE, {
    defaultLabel: 'Claude’s default',
    newChatsOnly: true,
    stricter: { ladder: [false], from: REPO_AND_LOCAL, onlyStricter: true }
  }),
  remote('inputNeededNotifEnabled', 'Phone alert when Claude needs you', 'A push notification on your phone when a question or approval waits, while Remote Control is on.', TOGGLE, {
    defaultLabel: 'your account’s choice'
  }),
  remote('agentPushNotifEnabled', 'Phone alerts Claude decides on', 'Claude may send your phone a push notification, such as when a long task finishes.', TOGGLE, { defaultLabel: 'your account’s choice' }),
  remote('enableArtifact', 'Artifacts', 'Claude can publish chat output as a private web page on claude.ai. Off in any layer wins.', TOGGLE, {
    defaultLabel: 'your account’s choice',
    stricter: { ladder: [false], from: EVERY_SOURCE, onlyStricter: true }
  }),
  remote('preferredNotifChannel', 'Terminal notifications', 'How the terminal tells you a task finished or an approval waits.', choice(['auto', 'Automatic'], ['terminal_bell', 'Terminal bell'], ['iterm2', 'iTerm2'], ['iterm2_with_bell', 'iTerm2 and bell'], ['kitty', 'Kitty'], ['ghostty', 'Ghostty'], ['notifications_disabled', 'None']), {
    default: 'auto',
    ...TERMINAL_ONLY
  }),
  remote('awaySummaryEnabled', 'Recap when you come back', 'A one-line recap of the chat when you return after a few minutes away.', TOGGLE, { default: true, ...TERMINAL_ONLY }),
  remote('disableRemoteControl', 'Turn off Remote Control', 'No chat can connect to claude.ai/code.', TOGGLE, { default: false, advanced: true }),
  remote('disableArtifact', 'Turn off artifacts (older setting)', 'The older way to turn artifacts off; only on counts.', TOGGLE, {
    default: false,
    advanced: true,
    stricter: { ladder: [true], from: EVERY_SOURCE, onlyStricter: true }
  }),
  remote('disableDeepLinkRegistration', 'Turn off claude-cli:// links', 'Other programs can no longer open Claude with a prompt filled in.', DISABLE, { defaultLabel: 'links work', advanced: true, ...TERMINAL_ONLY }),
  remote('remote.defaultEnvironmentId', 'Default cloud environment', 'The cloud environment a cloud chat started from the terminal runs in.', TEXT, { defaultLabel: 'Anthropic’s', advanced: true, ...TERMINAL_ONLY }),
  remote('sshConfigs', 'SSH connections', 'SSH connections listed in the desktop app.', OTHER_KEYS, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true, ...TERMINAL_ONLY }),
  remote('sshHostCommands', 'SSH connections from a command', 'SSH connections in the desktop app whose host a command prints.', OTHER_KEYS, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true, ...TERMINAL_ONLY })
]

const updates = inCategory('Updates, privacy & sign-in')
const UPDATES_PRIVACY_AND_SIGN_IN: SettingEntry[] = [
  updates('autoUpdatesChannel', 'Update channel', 'The newest release, or one about a week old that skips releases with big problems.', choice(['latest', 'Latest'], ['stable', 'Stable']), {
    default: 'latest',
    ...TERMINAL_ONLY
  }),
  updates('cleanupPeriodDays', 'Keep chat history for', 'Days before old chat transcripts are deleted, without a message.', { kind: 'number', min: 1 }, { default: 30 }),
  updates('minimumVersion', 'Lowest version to update to', 'Updates never install a version below this one, such as 2.1.323.', TEXT, { defaultLabel: 'any version', advanced: true, ...TERMINAL_ONLY }),
  updates('skipWebFetchPreflight', 'Skip the web address check', 'Web fetches no longer send the address to Anthropic for a safety check first.', TOGGLE, { default: false, advanced: true }),
  updates('feedbackDrafts', 'Feedback drafts', 'Whether Claude may draft feedback for you to review, and whether a card says so.', choice(['notify', 'Draft and show a card'], ['quiet', 'Draft quietly'], ['off', 'Off']), {
    default: 'notify',
    layers: ACCOUNT_ONLY,
    advanced: true,
    ...TERMINAL_ONLY
  }),
  updates('feedbackSurveyRate', 'Survey rate', 'How likely the chat quality survey is to appear, from 0 (never) to 1.', { kind: 'number', min: 0, max: 1 }, {
    defaultLabel: 'Anthropic’s rate',
    advanced: true,
    ...TERMINAL_ONLY
  }),
  updates('desktopSessionCleanupPeriodDays', 'Keep desktop chat history for', 'Days before transcripts of chats from Claude Desktop are deleted; 0 keeps them.', { kind: 'number', min: 0 }, {
    default: 0,
    layers: ACCOUNT_ONLY,
    advanced: true,
    ...TERMINAL_ONLY
  }),
  updates('forceLoginMethod', 'Sign-in method', 'Which kind of account people can sign in with.', {
    kind: 'choice',
    options: [
      { value: 'claudeai', label: 'claude.ai' },
      { value: 'console', label: 'Claude Console' },
      { value: 'gateway', label: 'Cloud gateway', layers: ACCOUNT_ONLY }
    ]
  }, { defaultLabel: 'you pick when you sign in', advanced: true }),
  updates('forceLoginOrgUUID', 'Organisation to sign in to', 'The organisation picked first when you sign in, as its id.', OTHER_KEYS, { defaultLabel: 'any', advanced: true }),
  updates('forceLoginGatewayUrl', 'Cloud gateway address', 'The address the cloud gateway sign-in connects to.', TEXT, { defaultLabel: 'none', layers: ACCOUNT_ONLY, advanced: true }),
  updates('apiKeyHelper', 'API key command', 'A command that prints the key Claude sends with each request.', TEXT, { defaultLabel: 'none', advanced: true }),
  updates('awsAuthRefresh', 'AWS sign-in refresh command', 'A command, such as aws sso login, that refreshes Amazon Bedrock credentials when they stop working.', TEXT, {
    defaultLabel: 'none',
    advanced: true
  }),
  updates('awsCredentialExport', 'AWS credentials command', 'A command that prints the AWS credentials for Amazon Bedrock.', TEXT, { defaultLabel: 'the usual AWS credentials', advanced: true }),
  updates('gcpAuthRefresh', 'Google Cloud sign-in refresh command', 'A command that refreshes Google Cloud credentials when they run out.', TEXT, { defaultLabel: 'none', advanced: true }),
  updates('otelHeadersHelper', 'Telemetry headers command', 'A command that prints the headers sent with OpenTelemetry exports.', TEXT, { defaultLabel: 'none', advanced: true })
]

export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  ...MODEL_AND_THINKING,
  ...PERMISSIONS,
  ...HOOKS,
  ...INTERFACE,
  ...MEMORY_AND_CONTEXT,
  ...ENVIRONMENT,
  ...GIT_AND_ATTRIBUTION,
  ...MCP_SERVERS,
  ...PLUGINS_AND_SKILLS,
  ...AGENTS_AND_WORKTREES,
  ...REMOTE_AND_NOTIFICATIONS,
  ...UPDATES_PRIVACY_AND_SIGN_IN
]

/** The catalog entry a key path belongs to: its own, or the entry of the object it sits in. */
export const entryOf = (path: string): SettingEntry | undefined =>
  SETTINGS_CATALOG.find((e) => e.key === path) ?? SETTINGS_CATALOG.find((e) => path.startsWith(`${e.key}.`))

const splitIntoRows = (path: string): boolean => SETTINGS_CATALOG.some((e) => e.key.startsWith(`${path}.`))

/** The key paths in the settings that no catalog row shows, in file order. */
export function otherKeys(settings: SettingsObject | null): string[] {
  const walk = (value: SettingsObject, parent: string[]): string[] =>
    Object.entries(value).flatMap(([key, inner]) => {
      const path = keyPath(...parent, key)
      const entry = entryOf(path)
      if (entry) return entry.key === path && entry.leavesOut ? entry.leavesOut(inner).map((inside) => keyPath(...parent, key, ...inside)) : []
      return splitIntoRows(path) && isSettingsObject(inner) ? walk(inner, [...parent, key]) : [path]
    })
  return settings ? walk(settings, []) : []
}

/** The catalog's entry for a key, else a plain one for a key the page has no control for. */
export function entryFor(key: string): SettingEntry {
  return (
    SETTINGS_CATALOG.find((e) => e.key === key) ?? {
      key,
      label: pathKeys(key).join('.'),
      description: '',
      category: 'Other keys',
      control: OTHER_KEYS,
      layers: ALL_LAYERS,
      terminalOnly: false,
      newChatsOnly: false,
      advanced: false
    }
  )
}

export interface SettingsFilter {
  category: SettingCategory
  /** Searches every category when not blank. */
  query: string
  showAdvanced: boolean
  hideTerminalOnly: boolean
}

export interface SettingsGroup {
  category: SettingCategory
  entries: SettingEntry[]
}

const searchText = (entry: SettingEntry): string => `${entry.label} ${entry.description} ${entry.key}`.toLowerCase()

/** Every word of the query is in the label, the description or the raw key. */
export const matchesSearch = (entry: SettingEntry, query: string): boolean => {
  const text = searchText(entry)
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word))
}

/** The rows the page shows, by category, common ones first; a search looks through advanced ones too. */
export function shownSettings(filter: SettingsFilter): SettingsGroup[] {
  const searching = filter.query.trim() !== ''
  const shown = SETTINGS_CATALOG.filter(
    (e) =>
      (searching ? matchesSearch(e, filter.query) : e.category === filter.category && (filter.showAdvanced || !e.advanced)) && !(filter.hideTerminalOnly && e.terminalOnly)
  )
  return SETTING_CATEGORIES.map((category) => {
    const inGroup = shown.filter((e) => e.category === category)
    return { category, entries: [...inGroup.filter((e) => !e.advanced), ...inGroup.filter((e) => e.advanced)] }
  }).filter((group) => group.entries.length > 0)
}

const optionLabel = (options: ChoiceOption[], value: unknown): string | undefined => options.find((o) => o.value === value)?.label

/** Each model in a `modelSettings` value with the effort saved for it. */
export function savedEfforts(value: unknown): [model: string, level: string][] {
  if (!isSettingsObject(value)) return []
  return Object.entries(value).flatMap(([model, settings]) => (isSettingsObject(settings) && typeof settings.effortLevel === 'string' ? [[model, settings.effortLevel]] : []))
}

export const isRuleListEntry = (entry: SettingEntry): boolean => entry.control.kind === 'editor' && entry.control.editor === 'permissions'

export const isHooksEntry = (entry: SettingEntry): boolean => entry.control.kind === 'editor' && entry.control.editor === 'hooks'

export const isStatusLineEntry = (entry: SettingEntry): boolean => entry.control.kind === 'editor' && entry.control.editor === 'statusLine'

const counted = (n: number, one: string): string => (n === 0 ? 'none' : `${n} ${one}${n === 1 ? '' : 's'}`)

export const isModelEffort = (entry: SettingEntry): boolean => entry.control.kind === 'editor' && entry.control.editor === 'modelEffort'

/** A setting edited as raw JSON, as the page has no plainer control for it. */
export const isRawJson = (entry: SettingEntry): boolean => entry.control.kind === 'editor' && entry.control.editor === 'otherKeys'

export function formatSettingValue(entry: SettingEntry, value: unknown): string {
  if (value === undefined) return 'not set'
  if (entry.control.kind === 'toggle' && typeof value === 'boolean') return value ? 'on' : 'off'
  if (entry.control.kind === 'choice') {
    const label = optionLabel(entry.control.options, value)
    if (label) return label
  }
  if (isModelEffort(entry) && isSettingsObject(value)) {
    const pairs = savedEfforts(value).map(([model, level]) => `${model}: ${optionLabel(EFFORT_OPTIONS, level) ?? level}`)
    return pairs.length === 0 ? 'none' : pairs.join(', ')
  }
  if (isRuleListEntry(entry) && Array.isArray(value)) return counted(value.length, 'rule')
  if (isHooksEntry(entry) && isSettingsObject(value)) return counted(readHookEvents(value).reduce((n, e) => n + e.groups.reduce((m, g) => m + g.hooks.length, 0), 0), 'hook')
  if (isStatusLineEntry(entry) && isSettingsObject(value) && typeof value.command === 'string') return value.command
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.length === 0 ? 'none' : value.join(', ')
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const missingFrom = (items: unknown[], from: unknown[]): unknown[] => items.filter((item) => !from.some((other) => sameValue(other, item)))
const listed = (items: unknown[]): string => items.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ')

/** A change as Review shows it: an item list's items added and removed, any other value as before → after. */
export function changeText(entry: SettingEntry, before: unknown, after: unknown): string {
  if (ITEM_LISTS.includes(entry.key) && isRuleList(before) && isRuleList(after)) {
    const added = missingFrom(after ?? [], before ?? [])
    const removed = missingFrom(before ?? [], after ?? [])
    const parts = [added.length > 0 && `Added ${listed(added)}`, removed.length > 0 && `Removed ${listed(removed)}`].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : 'Same rules, new order'
  }
  return `${formatSettingValue(entry, before)} → ${formatSettingValue(entry, after)}`
}

export function defaultText(entry: SettingEntry): string {
  return `Default: ${entry.defaultLabel ?? formatSettingValue(entry, entry.default)}`
}
