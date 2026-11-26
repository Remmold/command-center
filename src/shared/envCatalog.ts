import { SOURCE_ORDER, isSettingsObject, type SettingsLayer, type SettingsObject, type SourceLayer } from './claudeSettings'

/** Every variable https://code.claude.com/docs/en/env-vars documents, in its order. */
export const ENV_VAR_NAMES: readonly string[] = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_AWS_API_KEY', 'ANTHROPIC_AWS_BASE_URL', 'ANTHROPIC_AWS_WORKSPACE_ID', 'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_BEDROCK_MANTLE_BASE_URL', 'ANTHROPIC_BEDROCK_REGION_PREFIX', 'ANTHROPIC_BEDROCK_SERVICE_TIER', 'ANTHROPIC_BETAS',
  'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_CUSTOM_MODEL_OPTION', 'ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION', 'ANTHROPIC_CUSTOM_MODEL_OPTION_NAME',
  'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES', 'ANTHROPIC_DEFAULT_FABLE_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME', 'ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION', 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME', 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION', 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME', 'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_AUTH_TOKEN', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_GOOGLE_CLOUD_BASE_URL',
  'ANTHROPIC_GOOGLE_CLOUD_LOCATION', 'ANTHROPIC_GOOGLE_CLOUD_PROJECT', 'ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID', 'ANTHROPIC_MODEL', 'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_PROFILE', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION', 'ANTHROPIC_VERTEX_BASE_URL', 'ANTHROPIC_VERTEX_PROJECT_ID',
  'ANTHROPIC_WORKSPACE_ID', 'API_FORCE_IDLE_TIMEOUT', 'API_TIMEOUT_MS', 'AWS_BEARER_TOKEN_BEDROCK', 'BASH_DEFAULT_TIMEOUT_MS', 'BASH_MAX_OUTPUT_LENGTH',
  'BASH_MAX_TIMEOUT_MS', 'BETA_TRACING_ENDPOINT', 'CCR_FORCE_BUNDLE', 'CLAUDECODE', 'CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS',
  'CLAUDE_AGENT_SDK_MCP_NO_PREFIX', 'CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS', 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', 'CLAUDE_AUTO_BACKGROUND_TASKS',
  'CLAUDE_AX_PREPARK_MS', 'CLAUDE_AX_SCREEN_READER', 'CLAUDE_AX_STARTUP_QUIET_MS', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR',
  'CLAUDE_BYTE_STREAM_IDLE_TIMEOUT_MS', 'CLAUDE_CLIENT_PRESENCE_FILE', 'CLAUDE_CODE_ACCESSIBILITY', 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD',
  'CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT', 'CLAUDE_CODE_ALWAYS_ENABLE_EFFORT', 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS', 'CLAUDE_CODE_ARTIFACT_AUTO_OPEN',
  'CLAUDE_CODE_ARTIFACT_COMMENTS', 'CLAUDE_CODE_ARTIFACT_COMMENTS_AUTOREACT', 'CLAUDE_CODE_ARTIFACT_PUBLISH_EDITS', 'CLAUDE_CODE_ATTRIBUTION_HEADER',
  'CLAUDE_CODE_AUTO_BACKGROUND_WORKER_CHECKIN_SECONDS', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_CODE_AUTO_CONNECT_IDE', 'CLAUDE_CODE_AUTO_MODE_MODEL',
  'CLAUDE_CODE_AUTO_MODE_SERVER', 'CLAUDE_CODE_AUTOMOUNT_ROOTS', 'CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS', 'CLAUDE_CODE_BASH_EDIT_DIFF',
  'CLAUDE_CODE_BG_TASKS_REPORT_RUNNING', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_BS_AS_CTRL_BACKSPACE', 'CLAUDE_CODE_CERT_STORE',
  'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_CLIENT_CERT', 'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', 'CLAUDE_CODE_CONFIG_LOCK_WAIT_MS',
  'CLAUDE_CODE_CONNECT_TIMEOUT_MS', 'CLAUDE_CODE_DEBUG_LOGS_DIR', 'CLAUDE_CODE_DEBUG_LOG_LEVEL', 'CLAUDE_CODE_DISABLE_1M_CONTEXT',
  'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL', 'CLAUDE_CODE_DISABLE_AGENT_VIEW', 'CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN',
  'CLAUDE_CODE_DISABLE_ARTIFACT', 'CLAUDE_CODE_DISABLE_ATTACHMENTS', 'CLAUDE_CODE_DISABLE_AUTH_REFRESH_LOCK', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
  'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_DEFAULT', 'CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_GUARD',
  'CLAUDE_CODE_DISABLE_BG_EXIT_HANDOFF', 'CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP', 'CLAUDE_CODE_DISABLE_BG_STABLE_PATH',
  'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS', 'CLAUDE_CODE_DISABLE_CFC_PROMPT', 'CLAUDE_CODE_DISABLE_CLAUDE_MDS', 'CLAUDE_CODE_DISABLE_CRON',
  'CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT', 'CLAUDE_CODE_DISABLE_DEFERRED_TOOL_RESUME', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS', 'CLAUDE_CODE_DISABLE_FAST_MODE', 'CLAUDE_CODE_DISABLE_FEATURE_FLAGS', 'CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY',
  'CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING', 'CLAUDE_CODE_DISABLE_FILE_MENTIONS', 'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS',
  'CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT', 'CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP', 'CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND',
  'CLAUDE_CODE_DISABLE_MODEL_ACCESS_FALLBACK', 'CLAUDE_CODE_DISABLE_MOUNTED_DRIVE_RM_PROMPT', 'CLAUDE_CODE_DISABLE_MOUSE', 'CLAUDE_CODE_DISABLE_MOUSE_CLICKS',
  'CLAUDE_CODE_DISABLE_MTLS_RELOAD_ON_STALE_CONNECTION', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK',
  'CLAUDE_CODE_DISABLE_NOTIFICATION_PRESENCE_CHECK', 'CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL',
  'CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS', 'CLAUDE_CODE_DISABLE_POLICY_SKILLS', 'CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY',
  'CLAUDE_CODE_DISABLE_PROXY_SCHEME_REPAIR', 'CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK', 'CLAUDE_CODE_DISABLE_RESPONSE_COMPRESSION',
  'CLAUDE_CODE_DISABLE_SHELL_HEAD_START', 'CLAUDE_CODE_DISABLE_SHIP', 'CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS', 'CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT',
  'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', 'CLAUDE_CODE_DISABLE_THINKING', 'CLAUDE_CODE_DISABLE_ULTRAREVIEW_TRUST_CHECK', 'CLAUDE_CODE_DISABLE_ULTRATHINK',
  'CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT', 'CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL', 'CLAUDE_CODE_DISABLE_WEB_FETCH',
  'CLAUDE_CODE_DISABLE_WINDOWS_SHELL_LAUNCHER', 'CLAUDE_CODE_DISABLE_WORKFLOWS', 'CLAUDE_CODE_DROP_UNAVAILABLE_DEFERRED_TOOL', 'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS', 'CLAUDE_CODE_ENABLE_AUTO_MODE', 'CLAUDE_CODE_ENABLE_AWAY_SUMMARY', 'CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH',
  'CLAUDE_CODE_ENABLE_CFC', 'CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL', 'CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING',
  'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY', 'CLAUDE_CODE_ENABLE_OPUS_4_7_FAST_MODE', 'CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION',
  'CLAUDE_CODE_ENABLE_SHARE_BUNDLE', 'CLAUDE_CODE_ENABLE_TASKS', 'CLAUDE_CODE_ENABLE_TELEMETRY', 'CLAUDE_CODE_ENABLE_TODO_TOOLS',
  'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS', 'CLAUDE_CODE_EXIT_AFTER_STOP_DELAY', 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
  'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE', 'CLAUDE_CODE_EXTRA_BODY', 'CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_FORCE_SESSION_PERSISTENCE',
  'CLAUDE_CODE_FORCE_STRIKETHROUGH', 'CLAUDE_CODE_FORCE_SYNC_OUTPUT', 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES', 'CLAUDE_CODE_FORK_SUBAGENT',
  'CLAUDE_CODE_FORWARD_SUBAGENT_TEXT', 'CLAUDE_CODE_FULL_SIGN_IN_LINK', 'CLAUDE_CODE_GATEWAY_HINT_HEADERS', 'CLAUDE_CODE_GATEWAY_MODEL_DISCOVERY_TIMEOUT_MS',
  'CLAUDE_CODE_GIT_BASH_PATH', 'CLAUDE_CODE_GLOB_HIDDEN', 'CLAUDE_CODE_GLOB_NO_IGNORE', 'CLAUDE_CODE_GLOB_TIMEOUT_SECONDS', 'CLAUDE_CODE_GOAL_CHECKIN_MINUTES',
  'CLAUDE_CODE_GZIP_REQUEST_BODIES', 'CLAUDE_CODE_HIDE_CWD', 'CLAUDE_CODE_IDE_HOST_OVERRIDE', 'CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL',
  'CLAUDE_CODE_IDE_SKIP_VALID_CHECK', 'CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS', 'CLAUDE_CODE_LOOP_KEEPALIVE', 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS',
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_MAX_RETRIES',
  'CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION', 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH', 'CLAUDE_CODE_MAX_TURNS', 'CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION',
  'CLAUDE_CODE_MCP_ALLOWLIST_ENV', 'CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS', 'CLAUDE_CODE_MCP_STARTUP_WAIT_MS', 'CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_NATIVE_CURSOR', 'CLAUDE_CODE_NEW_INIT', 'CLAUDE_CODE_NONBLOCKING_STDOUT',
  'CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES', 'CLAUDE_CODE_NO_FLICKER', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE', 'CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH', 'CLAUDE_CODE_OTEL_DIAG_STDERR',
  'CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS', 'CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS', 'CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS',
  'CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS', 'CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS', 'CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE',
  'CLAUDE_CODE_PERFORCE_MODE', 'CLAUDE_CODE_PLUGIN_CACHE_DIR', 'CLAUDE_CODE_PLUGIN_DIRS', 'CLAUDE_CODE_PLUGIN_DIR_WATCH', 'CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS',
  'CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE', 'CLAUDE_CODE_PLUGIN_PREFER_HTTPS', 'CLAUDE_CODE_PLUGIN_SEED_DIR',
  'CLAUDE_CODE_POWERSHELL_RESPECT_EXECUTION_POLICY', 'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS', 'CLAUDE_CODE_PROCESS_WRAPPER', 'CLAUDE_CODE_PROJECT_DIR_NAME',
  'CLAUDE_CODE_PROMPT_CACHE_TTL', 'CLAUDE_CODE_PROPAGATE_TRACEPARENT', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'CLAUDE_CODE_PROXY_RESOLVES_HOSTS',
  'CLAUDE_CODE_REMOTE', 'CLAUDE_CODE_REMOTE_SESSION_ID', 'CLAUDE_CODE_RESTRICTED', 'CLAUDE_CODE_RESUME_HINT_COMMAND', 'CLAUDE_CODE_RESUME_INTERRUPTED_TURN',
  'CLAUDE_CODE_RESUME_INTERRUPTED_TURN_MAX_AGE_MS', 'CLAUDE_CODE_RESUME_PROMPT', 'CLAUDE_CODE_RESUME_SHOWS_CUT_OFF_CALLS', 'CLAUDE_CODE_RETRY_WATCHDOG',
  'CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS', 'CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS', 'CLAUDE_CODE_SAFE_MODE', 'CLAUDE_CODE_SCRIPT_CAPS',
  'CLAUDE_CODE_SCROLL_SPEED', 'CLAUDE_CODE_SEND_FEEDBACK', 'CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SHELL',
  'CLAUDE_CODE_SHELL_PREFIX', 'CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT', 'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
  'CLAUDE_CODE_SKIP_ANTHROPIC_GOOGLE_CLOUD_AUTH', 'CLAUDE_CODE_SKIP_AWS_CRED_CACHE', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS', 'CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH', 'CLAUDE_CODE_SKIP_MANTLE_AUTH',
  'CLAUDE_CODE_SKIP_MODEL_ACCESS_MEMORY', 'CLAUDE_CODE_SKIP_PROMPT_HISTORY', 'CLAUDE_CODE_SKIP_VERTEX_AUTH', 'CLAUDE_CODE_STARTUP_FAILURE_RESULTS',
  'CLAUDE_CODE_STOP_HOOK_BLOCK_CAP', 'CLAUDE_CODE_STRICT_INLINE_SHELL_RM_PROMPT', 'CLAUDE_CODE_SUBAGENT_EFFORT', 'CLAUDE_CODE_SUBAGENT_HISTORY',
  'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
  'CLAUDE_CODE_SYNC_PLUGIN_INSTALL', 'CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS', 'CLAUDE_CODE_SYNC_SKILLS', 'CLAUDE_CODE_SYNC_SKILLS_INSTALL_TIMEOUT_MS',
  'CLAUDE_CODE_SYNC_SKILLS_WAIT_TIMEOUT_MS', 'CLAUDE_CODE_SYNTAX_HIGHLIGHT', 'CLAUDE_CODE_TASK_LIST_ID', 'CLAUDE_CODE_TMPDIR', 'CLAUDE_CODE_TMUX_TRUECOLOR',
  'CLAUDE_CODE_TOOL_MEMORY_CGROUP_EXCLUDE', 'CLAUDE_CODE_TOOL_MEMORY_LIMIT', 'CLAUDE_CODE_TRANSCRIPT_LOCAL_GC', 'CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_USE_POWERSHELL_TOOL', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_WARN_DISK_FREE_GIB', 'CLAUDE_CODE_WARN_MEMORY_FREE_GIB',
  'CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS', 'CLAUDE_CODE_WEBFETCH_DEADLINE_MS', 'CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR', 'CLAUDE_CODE_WORKER_CHECKIN_SCHEDULE',
  'CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS', 'CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS', 'CLAUDE_CODE_YOU_SHOULD_KNOW_DEBUG', 'CLAUDE_CONFIG_DIR',
  'CLAUDE_EFFORT', 'CLAUDE_ENABLE_BYTE_WATCHDOG', 'CLAUDE_ENABLE_BYTE_WATCHDOG_BEDROCK', 'CLAUDE_ENABLE_STREAM_WATCHDOG', 'CLAUDE_ENV_FILE', 'CLAUDE_JOB_DIR',
  'CLAUDE_PID', 'CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX', 'CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS', 'CLAUDE_STREAM_IDLE_TIMEOUT_MS',
  'CLAUDE_SUBAGENT_BG_SHELL_MAX_MS', 'DEBUG', 'DISABLE_AUTOUPDATER', 'DISABLE_AUTO_COMPACT', 'DISABLE_COMPACT', 'DISABLE_COST_WARNINGS',
  'DISABLE_DOCTOR_COMMAND', 'DISABLE_ERROR_REPORTING', 'DISABLE_EXTRA_USAGE_COMMAND', 'DISABLE_FEEDBACK_COMMAND', 'DISABLE_GROWTHBOOK',
  'DISABLE_INSTALLATION_CHECKS', 'DISABLE_INSTALL_GITHUB_APP_COMMAND', 'DISABLE_INTERLEAVED_THINKING', 'DISABLE_LOGIN_COMMAND', 'DISABLE_LOGOUT_COMMAND',
  'DISABLE_PROMPT_CACHING', 'DISABLE_PROMPT_CACHING_FABLE', 'DISABLE_PROMPT_CACHING_HAIKU', 'DISABLE_PROMPT_CACHING_OPUS', 'DISABLE_PROMPT_CACHING_SONNET',
  'DISABLE_TELEMETRY', 'DISABLE_UPDATES', 'DISABLE_UPGRADE_COMMAND', 'DO_NOT_TRACK', 'ENABLE_BETA_TRACING_DETAILED', 'ENABLE_CLAUDEAI_MCP_SERVERS',
  'ENABLE_PROMPT_CACHING_1H', 'ENABLE_PROMPT_CACHING_1H_BEDROCK', 'ENABLE_TOOL_SEARCH', 'FORCE_AUTOUPDATE_PLUGINS', 'FORCE_HYPERLINK',
  'FORCE_PROMPT_CACHING_5M', 'HTTP_PROXY', 'HTTPS_PROXY', 'IS_DEMO', 'MAX_MCP_OUTPUT_TOKENS', 'MAX_STRUCTURED_OUTPUT_RETRIES', 'MAX_THINKING_TOKENS',
  'MCP_CLIENT_SECRET', 'MCP_CONNECTION_NONBLOCKING', 'MCP_CONNECT_TIMEOUT_MS', 'MCP_DISCOVERY_CACHE', 'MCP_DISCOVERY_CACHE_MAX_STALE_S',
  'MCP_DISCOVERY_CACHE_STRIKES', 'MCP_DISCOVERY_CACHE_TTL_S', 'MCP_OAUTH_CALLBACK_PORT', 'MCP_PROTOCOL_NEGOTIATION', 'MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE',
  'MCP_SDK_GENERATION', 'MCP_SERVER_CONNECTION_BATCH_SIZE', 'MCP_TIMEOUT', 'MCP_TOOL_TIMEOUT', 'NO_PROXY', 'OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT',
  'OTEL_LOG_ASSISTANT_RESPONSES', 'OTEL_LOG_MANAGED_SETTINGS', 'OTEL_LOG_RAW_API_BODIES', 'OTEL_LOG_TOOL_CONTENT', 'OTEL_LOG_TOOL_DETAILS',
  'OTEL_LOG_USER_PROMPTS', 'OTEL_METRICS_INCLUDE_ACCOUNT_UUID', 'OTEL_METRICS_INCLUDE_ENTRYPOINT', 'OTEL_METRICS_INCLUDE_REPOSITORY',
  'OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES', 'OTEL_METRICS_INCLUDE_SESSION_ID', 'OTEL_METRICS_INCLUDE_VERSION', 'OTEL_RESOURCE_INCLUDE_HOST',
  'SLASH_COMMAND_TOOL_CHAR_BUDGET', 'TASK_MAX_OUTPUT_LENGTH', 'USE_BUILTIN_RIPGREP', 'VERTEX_REGION_CLAUDE_3_5_HAIKU', 'VERTEX_REGION_CLAUDE_3_5_SONNET',
  'VERTEX_REGION_CLAUDE_3_7_SONNET', 'VERTEX_REGION_CLAUDE_4_0_OPUS', 'VERTEX_REGION_CLAUDE_4_0_SONNET', 'VERTEX_REGION_CLAUDE_4_1_OPUS',
  'VERTEX_REGION_CLAUDE_4_5_OPUS', 'VERTEX_REGION_CLAUDE_4_5_SONNET', 'VERTEX_REGION_CLAUDE_4_6_OPUS', 'VERTEX_REGION_CLAUDE_4_6_SONNET',
  'VERTEX_REGION_CLAUDE_4_7_OPUS', 'VERTEX_REGION_CLAUDE_4_8_OPUS', 'VERTEX_REGION_CLAUDE_5_5_OPUS', 'VERTEX_REGION_CLAUDE_5_5_SONNET',
  'VERTEX_REGION_CLAUDE_5_OPUS', 'VERTEX_REGION_CLAUDE_5_SONNET', 'VERTEX_REGION_CLAUDE_FABLE_5', 'VERTEX_REGION_CLAUDE_FABLE_5_1',
  'VERTEX_REGION_CLAUDE_FABLE_5_2', 'VERTEX_REGION_CLAUDE_HAIKU_4_5', 'VERTEX_REGION_CLAUDE_HAIKU_5_5'
]

export type EnvValueKind = 'toggle' | 'number' | 'text'

export interface EnvVar {
  name: string
  description: string
  kind: EnvValueKind
  /** For a toggle, the text that turns it on; '1' when absent. */
  on?: string
  /** For a toggle, the text that turns it off; '0' when absent. */
  off?: string
  /** Off takes the variable out of the file instead of saving the off text. */
  offRemoves?: boolean
  /** Claude reads only whether it is set, so any text, 0 too, is on. */
  setOrNot?: boolean
  placeholder?: string
}

const toggle = (name: string, description: string, extra: Partial<EnvVar> = {}): EnvVar => ({ name, description, kind: 'toggle', ...extra })
const number = (name: string, description: string, placeholder?: string): EnvVar => ({ name, description, kind: 'number', placeholder })
const text = (name: string, description: string, placeholder?: string): EnvVar => ({ name, description, kind: 'text', placeholder })
const SET_OR_NOT: Partial<EnvVar> = { setOrNot: true, offRemoves: true }

/** The variables worth a plain explanation and a typed input. */
export const DESCRIBED_ENV_VARS: readonly EnvVar[] = [
  number('API_TIMEOUT_MS', 'Milliseconds each request to the model has to start answering. Default 600000, 10 minutes.', '600000'),
  number('CLAUDE_CODE_MAX_RETRIES', 'How many times a failed request to the model is tried again. Default 10.', '10'),
  number('CLAUDE_STREAM_IDLE_TIMEOUT_MS', 'Milliseconds an answer may stall before the connection is closed; at least 300000, 5 minutes.', '300000'),
  number('BASH_DEFAULT_TIMEOUT_MS', 'Milliseconds a shell command may run when Claude sets no limit. Default 120000, 2 minutes.', '120000'),
  number('BASH_MAX_TIMEOUT_MS', 'The longest limit, in milliseconds, Claude may give a shell command. Default 600000, 10 minutes.', '600000'),
  number('BASH_MAX_OUTPUT_LENGTH', 'Characters of a command’s output Claude reads back. Default 30000, at most 150000; the Command output setting wins.', '30000'),
  toggle('CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR', 'Goes back to the project folder after each shell command, so a cd doesn’t carry over.'),
  text('CLAUDE_CODE_SHELL', 'The bash or zsh program shell commands run in, as a full path.', '/usr/bin/bash'),
  text('CLAUDE_CODE_GIT_BASH_PATH', 'On Windows, the full path of Git Bash’s bash.exe when it isn’t on the PATH.', 'C:\\Program Files\\Git\\bin\\bash.exe'),
  toggle('CLAUDE_CODE_USE_POWERSHELL_TOOL', 'Gives Claude a PowerShell tool beside Bash; off takes it away where it is on by default.'),
  text('CLAUDE_CODE_SHELL_PREFIX', 'A command put in front of every shell command Claude starts, such as a logging wrapper.'),
  toggle('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'Stops Claude running commands and subagents in the background.'),
  number('MCP_TIMEOUT', 'Milliseconds an MCP server has to start. Default 30000, 30 seconds.', '30000'),
  number('MCP_TOOL_TIMEOUT', 'Milliseconds an MCP tool call may take. Default about 28 hours; web servers also stop each request after 60 seconds.', '100000000'),
  number('MCP_CONNECT_TIMEOUT_MS', 'Milliseconds start-up waits for MCP servers when it waits for them. Default 5000.', '5000'),
  toggle('MCP_CONNECTION_NONBLOCKING', 'MCP servers connect in the background while you start typing. On by default; off waits for them first.'),
  number('MAX_MCP_OUTPUT_TOKENS', 'Tokens an MCP tool’s answer may hold. Default 25000.', '25000'),
  text('ENABLE_TOOL_SEARCH', 'How MCP tools load: true finds them when needed, false loads all at start, auto or auto:5 once they fill that share of the context.', 'auto'),
  toggle('DISABLE_AUTOUPDATER', 'Stops updates in the background; claude update still works.'),
  toggle('DISABLE_UPDATES', 'Blocks every update, claude update and claude install included.'),
  toggle('DISABLE_TELEMETRY', 'Sends no usage telemetry. Any value turns it on, even 0; remove the variable to turn it off.', SET_OR_NOT),
  toggle('DISABLE_ERROR_REPORTING', 'Sends no error reports. Any value turns it on, even 0; remove the variable to turn it off.', SET_OR_NOT),
  toggle('DO_NOT_TRACK', 'Sends no usage telemetry, the convention many developer tools share.'),
  toggle('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'Turns off everything that isn’t talking to the model: updates, telemetry, error reports, feedback and release notes. Any value turns it on.', SET_OR_NOT),
  toggle('CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY', 'Stops the “How is Claude doing?” surveys.'),
  toggle('DISABLE_COST_WARNINGS', 'Stops the warnings about what a chat costs.'),
  toggle('CLAUDE_CODE_ENABLE_TELEMETRY', 'Sends OpenTelemetry metrics and logs to your own collector. Only Account settings count.'),
  toggle('CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', 'Takes keys and passwords out of the variables the commands, hooks and MCP servers Claude starts get.'),
  text('HTTP_PROXY', 'The proxy server for plain web requests.', 'http://proxy:8080'),
  text('HTTPS_PROXY', 'The proxy server for secure web requests, which is nearly all of them.', 'http://proxy:8080'),
  text('NO_PROXY', 'Addresses reached without the proxy, separated by commas.', 'localhost,127.0.0.1'),
  text('ANTHROPIC_BASE_URL', 'Sends requests to the model through this address, such as a proxy or gateway.', 'https://gateway.example.com'),
  text('ANTHROPIC_API_KEY', 'An API key used instead of your subscription, even when you are signed in.'),
  text('ANTHROPIC_AUTH_TOKEN', 'A token sent as the Authorization header, with Bearer in front.'),
  text('CLAUDE_CODE_OAUTH_TOKEN', 'A claude.ai sign-in token used instead of /login. Only Account settings count.'),
  toggle('CLAUDE_CODE_USE_BEDROCK', 'Uses Claude through Amazon Bedrock instead of Anthropic.'),
  toggle('CLAUDE_CODE_USE_MANTLE', 'Uses Claude through Amazon Bedrock’s Mantle endpoint.'),
  toggle('CLAUDE_CODE_USE_VERTEX', 'Uses Claude through Google Cloud’s Agent Platform (Vertex AI).'),
  toggle('CLAUDE_CODE_USE_FOUNDRY', 'Uses Claude through Microsoft Foundry.'),
  toggle('CLAUDE_CODE_USE_ANTHROPIC_AWS', 'Uses the Claude Platform on AWS.'),
  toggle('CLAUDE_CODE_SKIP_BEDROCK_AUTH', 'Sends Bedrock requests without AWS sign-in, such as through a gateway that signs them.'),
  text('AWS_BEARER_TOKEN_BEDROCK', 'An Amazon Bedrock API key.'),
  text('ANTHROPIC_VERTEX_PROJECT_ID', 'The Google Cloud project Agent Platform requests go to.'),
  text('ANTHROPIC_MODEL', 'The model chats use, as an alias such as opus or a full model name.', 'opus'),
  text('ANTHROPIC_DEFAULT_OPUS_MODEL', 'The model the opus alias stands for, such as a provider’s own model id.'),
  text('ANTHROPIC_DEFAULT_SONNET_MODEL', 'The model the sonnet alias stands for.'),
  text('ANTHROPIC_DEFAULT_HAIKU_MODEL', 'The model the haiku alias stands for, also used for small background jobs.'),
  text('CLAUDE_CODE_SUBAGENT_MODEL', 'The model subagents, teammates and workflow agents use when nothing else picks one.', 'haiku'),
  text('CLAUDE_CODE_EFFORT_LEVEL', 'The effort for every chat: low, medium, high, xhigh or max. Beats /effort and the effort settings.', 'high'),
  number('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'The most tokens one answer may have. The default depends on the model; a value over its cap is lowered to it.'),
  number('MAX_THINKING_TOKENS', 'A fixed budget of thinking tokens. 0 turns thinking off where the model allows it.'),
  toggle('CLAUDE_CODE_DISABLE_THINKING', 'Leaves the thinking option out of requests, for gateways that refuse it.'),
  toggle('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING', 'Uses the fixed thinking budget instead of letting the model choose how long it thinks.'),
  toggle('DISABLE_INTERLEAVED_THINKING', 'Stops thinking between tool calls, for gateways that don’t support it.'),
  toggle('CLAUDE_CODE_DISABLE_1M_CONTEXT', 'Takes away the 1M token context and keeps models at 200K.'),
  toggle('CLAUDE_CODE_DISABLE_FAST_MODE', 'Turns fast mode off.'),
  number('CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'The context size Claude assumes for the model, for a gateway model whose size it doesn’t know.'),
  number('CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS', 'Tokens one file read may hold. Default 25000.', '25000'),
  toggle('DISABLE_PROMPT_CACHING', 'Stops caching the conversation for every model, so each request costs full price.'),
  toggle('ENABLE_PROMPT_CACHING_1H', 'Keeps the conversation cached for an hour instead of 5 minutes; cache writes cost more.'),
  toggle('FORCE_PROMPT_CACHING_5M', 'Keeps the cache at 5 minutes even where an hour would apply.'),
  text('CLAUDE_CODE_PROMPT_CACHE_TTL', 'How long the conversation stays cached: 5m or 1h. Beats the cache time setting.', '1h'),
  toggle('DISABLE_AUTO_COMPACT', 'Never compacts by itself as the context fills; /compact still works.'),
  toggle('DISABLE_COMPACT', 'Turns off all compaction, /compact included.'),
  number('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', 'Compacts earlier, at this percentage (1 to 100) of the compaction window.', '50'),
  number('CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'Tokens the conversation reaches before it is compacted, at least 100000.', '200000'),
  toggle('CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'Turns auto memory off. Off here removes the variable; a 0 typed in the file turns auto memory on even where it would be off.', { offRemoves: true }),
  toggle('CLAUDE_CODE_DISABLE_CLAUDE_MDS', 'Loads no CLAUDE.md or memory files at all.'),
  toggle('CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS', 'Leaves out Claude’s built-in commit and pull request instructions and the git status.'),
  toggle('CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING', 'Saves no files before edits, so /rewind can’t bring code back.'),
  number('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS', 'How many subagents may run at once. Default 20.', '20'),
  toggle('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', 'Turns on agent teams, which are experimental.'),
  toggle('CLAUDE_CODE_DISABLE_WEB_FETCH', 'Takes away the web fetch tool; web search stays.'),
  toggle('CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS', 'Sends no pre-release API features, for gateways that refuse them.'),
  toggle('CLAUDE_CODE_DISABLE_TERMINAL_TITLE', 'Stops Claude naming the terminal tab after the chat.'),
  toggle('CLAUDE_CODE_SYNTAX_HIGHLIGHT', 'Colours in diffs. On by default; off shows diffs as plain text.', { on: 'true', off: 'false' }),
  number('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS', 'Milliseconds the hooks that run as a chat ends may take. Default 1500, raised to the longest hook time limit up to a minute.', '1500'),
  text('CLAUDE_CONFIG_DIR', 'The folder Claude keeps its settings, history and plugins in, instead of ~/.claude. Only Account settings count.'),
  text('CLAUDE_CODE_TMPDIR', 'The folder Claude keeps its temporary files in. Only Account settings count.')
]

const DESCRIBED = new Map(DESCRIBED_ENV_VARS.map((v) => [v.name, v]))

export const envVar = (name: string): EnvVar | undefined => DESCRIBED.get(name)

const RETIRED: Readonly<Record<string, string>> = {
  ANTHROPIC_SMALL_FAST_MODEL: 'Deprecated: use ANTHROPIC_DEFAULT_HAIKU_MODEL',
  CLAUDE_CODE_AUTO_BACKGROUND_WORKER_CHECKIN_SECONDS: 'Removed in v2.1.283: use CLAUDE_CODE_WORKER_CHECKIN_SCHEDULE',
  CLAUDE_CODE_CONNECT_TIMEOUT_MS: 'Removed in v2.1.186; does nothing: use API_TIMEOUT_MS',
  CLAUDE_CODE_ENABLE_AUTO_MODE: 'Kept for older releases; has no effect',
  CLAUDE_CODE_ENABLE_OPUS_4_7_FAST_MODE: 'Removed in v2.1.142; does nothing',
  CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: 'Removed in v2.1.224; does nothing',
  CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE: 'Removed in v2.1.160; does nothing',
  CLAUDE_SUBAGENT_BG_SHELL_MAX_MS: 'Removed in v2.1.260; does nothing',
  ENABLE_PROMPT_CACHING_1H_BEDROCK: 'Deprecated: use ENABLE_PROMPT_CACHING_1H',
  TASK_MAX_OUTPUT_LENGTH: 'Removed in v2.1.277; does nothing'
}

export const retiredNote = (name: string): string | null => RETIRED[name] ?? null

/** A name part ending in KEY, TOKEN, SECRET or PASSWORD, so a count such as MAX_OUTPUT_TOKENS isn't one. */
export const isSecretName = (name: string): boolean => /(^|_)[A-Z0-9]*(KEY|TOKEN|SECRET|PASSWORD)\d*(_|$)/i.test(name)

export const MASK = '••••••••'

/** The text a toggle saves; undefined removes the variable. */
export function toggleText(v: EnvVar, on: boolean): string | undefined {
  if (on) return v.on ?? '1'
  return v.offRemoves ? undefined : (v.off ?? '0')
}

const ON_WORDS = new Set(['1', 'true', 'yes', 'on'])
const OFF_WORDS = new Set(['0', 'false', 'no', 'off'])

/** Whether the text turns the toggle on; undefined for text it doesn't read as either, or a variable that isn't a toggle. */
export function toggledOn(v: EnvVar | undefined, value: string): boolean | undefined {
  if (v?.kind !== 'toggle') return undefined
  if (v.setOrNot) return value !== ''
  const word = value.trim().toLowerCase()
  if (ON_WORDS.has(word) || word === v.on?.toLowerCase()) return true
  if (OFF_WORDS.has(word) || word === v.off?.toLowerCase()) return false
  return undefined
}

const NUMBER_TEXT = /^\d[\d_]*(\.\d+)?(e\d+)?$/i

/** Whether the variable takes the text: a number variable only digits, digit separators or an exponent, as the docs allow. */
export const acceptsValue = (v: EnvVar | undefined, text: string): boolean => v?.kind !== 'number' || NUMBER_TEXT.test(text)

/** What Repo and Local `env` can't set (settings reference, "Variables Claude Code ignores in env"). */
const NOT_FROM_REPO = new Set([
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_TMPDIR', 'HOME', 'TMPDIR', 'TMP', 'TEMP',
  'SystemRoot', 'ComSpec', 'ProgramData', 'LOCALAPPDATA', 'PATHEXT', 'PSModulePath',
  'OTEL_LOG_RAW_API_BODIES', 'ENABLE_BETA_TRACING_DETAILED', 'BETA_TRACING_ENDPOINT',
  'CLAUDE_CODE_ENABLE_TELEMETRY', 'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA', 'ENABLE_ENHANCED_TELEMETRY_BETA',
  'OTEL_LOGS_EXPORTER', 'OTEL_METRICS_EXPORTER', 'OTEL_TRACES_EXPORTER',
  'OTEL_LOG_USER_PROMPTS', 'OTEL_LOG_ASSISTANT_RESPONSES', 'OTEL_LOG_TOOL_CONTENT', 'OTEL_LOG_TOOL_DETAILS',
  'OTEL_EXPORTER_PROMETHEUS_HOST', 'OTEL_EXPORTER_PROMETHEUS_PORT', 'OTEL_RESOURCE_INCLUDE_HOST',
  'CLAUDE_CODE_PROCESS_WRAPPER', 'CLAUDE_CODE_SYNC_SKILLS', 'CLAUDE_CODE_SYNC_PLUGINS', 'CLAUDE_CODE_PLUGIN_CACHE_DIR', 'CLAUDE_CODE_PLUGIN_SEED_DIR',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES',
  'CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS', 'CLAUDE_CODE_DISABLE_ATTACHMENTS', 'CLAUDE_CODE_DISABLE_FILE_MENTIONS', 'CLAUDE_CODE_EXPERIMENTAL_CODE_MODE'
])
const NOT_FROM_REPO_PATTERN = /^(XDG_|CLAUDE_AX_|ProgramFiles)|^OTEL_EXPORTER_OTLP_.*(ENDPOINT|HEADERS|PROTOCOL|CERTIFICATE|CLIENT_KEY|INSECURE)$/

/** The values of that list Repo and Local still set, as they turn telemetry off. */
const TURNS_TELEMETRY_OFF: Readonly<Record<string, (value: string) => boolean>> = {
  OTEL_LOGS_EXPORTER: (value) => value === 'none',
  OTEL_METRICS_EXPORTER: (value) => value === 'none',
  OTEL_TRACES_EXPORTER: (value) => value === 'none',
  OTEL_LOG_USER_PROMPTS: (value) => OFF_WORDS.has(value.toLowerCase()),
  OTEL_LOG_TOOL_CONTENT: (value) => OFF_WORDS.has(value.toLowerCase()),
  OTEL_LOG_TOOL_DETAILS: (value) => OFF_WORDS.has(value.toLowerCase())
}

/** Variables Claude reads only from the environment it starts in. */
const NEVER_FROM_A_FILE = new Set([
  'CLAUDE_CODE_REMOTE', 'CLAUDE_CODE_ACCOUNT_UUID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_PROJECT_DIR_NAME', 'CLAUDE_CODE_RESTRICTED', 'CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY',
  'CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT', 'CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT', 'CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT',
  'CLAUDE_CODE_STRICT_INLINE_SHELL_RM_PROMPT', 'CLAUDE_CODE_DISABLE_MOUNTED_DRIVE_RM_PROMPT', 'CLAUDE_CODE_DISABLE_ULTRAREVIEW_TRUST_CHECK',
  'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS', 'CLAUDE_CODE_WARN_DISK_FREE_GIB', 'CLAUDE_CODE_WARN_MEMORY_FREE_GIB'
])

const notFromRepo = (name: string): boolean => NOT_FROM_REPO.has(name) || NOT_FROM_REPO_PATTERN.test(name)

/** Why Claude ignores the variable, or this value of it, from the layer; null when it reads it. */
export function ignoredHere(name: string, layer: SourceLayer, value?: string): string | null {
  if (NEVER_FROM_A_FILE.has(name)) return 'Claude reads this only from the environment it starts in, never from a settings file.'
  if ((layer === 'repo' || layer === 'local') && notFromRepo(name) && !(value !== undefined && TURNS_TELEMETRY_OFF[name]?.(value))) {
    return 'Claude ignores this from Repo and Local settings; set it in Account.'
  }
  return null
}

/** The variables the editor can't show: a value that isn't text; `[]` is the whole `env`. */
export function envLeftOut(value: unknown): string[][] {
  if (!isSettingsObject(value)) return [[]]
  return Object.entries(value).flatMap(([name, inner]) => (typeof inner === 'string' ? [] : [[name]]))
}

const textVars = (env: unknown): [string, string][] =>
  isSettingsObject(env) ? Object.entries(env).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value] as [string, string]] : [])) : []

export interface LayerValue {
  layer: SourceLayer
  value: string
}

export interface EnvRow {
  name: string
  /** The edited layer's value; undefined when another layer sets it. */
  value?: string
  /** The value Claude uses in the workspace; undefined when no layer it reads sets it. */
  effective?: LayerValue
  /** Every other layer that sets it, highest first. */
  others: LayerValue[]
}

/** The edited layer's variables in file order, then the ones only other layers set, each with the value that applies. */
export function envRows(edited: SettingsLayer, layers: Record<SourceLayer, SettingsObject | null>): EnvRow[] {
  const byLayer = SOURCE_ORDER.map((layer) => ({ layer, vars: textVars(layers[layer]?.env) }))
  const own = byLayer.find((l) => l.layer === edited)?.vars ?? []
  const names = [...own.map(([name]) => name), ...byLayer.flatMap((l) => l.vars.map(([name]) => name))].filter((name, i, all) => all.indexOf(name) === i)
  return names.map((name) => {
    const set = byLayer.flatMap(({ layer, vars }) => vars.filter(([n]) => n === name).map(([, value]) => ({ layer, value })))
    return {
      name,
      value: set.find((s) => s.layer === edited)?.value,
      effective: set.find((s) => ignoredHere(name, s.layer, s.value) === null),
      others: set.filter((s) => s.layer !== edited)
    }
  })
}
