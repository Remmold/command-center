# How the Claude Code VS Code extension handles model, effort, permissions, approvals and usage

Researched 2026-11-21 against the installed extension `anthropic.claude-code-2.1.330-win32-x64`
(`extension.js` = extension host incl. a bundled copy of the Agent SDK; `webview/index.js` = React UI),
the official docs at code.claude.com, and `claude --help` (2.1.293 on PATH). Quotes are excerpts from
minified bundles; minified identifiers (`V`, `X`, `tZ` …) are kept as-is.

## How to mimic it (summary)

1. **Spawn once, change everything live.** The extension spawns the CLI through the Agent SDK `query()`
   with `--input-format stream-json --output-format stream-json --verbose --permission-prompt-tool=stdio
   --setting-sources user,project,local --include-partial-messages --replay-user-messages [--resume <id>]`.
   It does **not** pass `--model`; the model comes from the user's `model` setting.
2. **Model, effort and thinking change mid-session, without a restart**, through stdin control requests:
   model and effort are sent as `apply_flag_settings` (and also written to `~/.claude/settings.json`, so
   they become the default for new sessions); thinking on/off is `set_max_thinking_tokens` (31999 or 0).
3. **Permission mode** is a picker on the right of the prompt box footer (Manual / Edit automatically /
   Plan / Auto / Bypass permissions, plus Don't ask). **Shift+Tab cycles** through the modes. A change
   sends `set_permission_mode`.
4. **Approvals** arrive as a CLI→host `control_request` with subtype `can_use_tool`. The host answers
   `{behavior:"allow", updatedInput, updatedPermissions}` or `{behavior:"deny", message, interrupt}`.
   The UI shows numbered buttons: **1 Yes**, **2 Yes, allow <rule> for <destination>** (or "Yes, and
   don't ask again"), **3 No**, plus a "Tell Claude what to do instead" text box. Esc cancels.
5. **Account & usage**: a `/usage` / "Account & usage…" dialog plus a sidebar header with bars
   "Session (5hr)" and "Weekly (7 day)". The data comes from the `get_usage` control request and from
   `rate_limit_event.rate_limit_info.unifiedWindows`. The account comes from the initialize response and
   `claude auth status --json`. There is **one account at a time**; "Switch account" means log in again.
6. **Stop** = `interrupt` control request (Esc or the Stop button), not a signal.

---

## 1. How the extension spawns the CLI

The extension calls the bundled SDK (`s$e({options:V})`) from `spawnClaude`. Options it sets (`extension.js`):

```
resume:t, canUseTool:n, ..., permissionMode:s??(...), allowDangerouslySkipPermissions:i, model:r,
systemPrompt:{type:"preset",preset:"claude_code",append:Y7e,snapshot:!0}, enableFileCheckpointing:!0,
thinking:a, includePartialMessages:!ee.env.remoteName, promptSuggestions:Pt("promptSuggestions")??!0,
hooks:{PreToolUse:[{matcher:"Edit|Write|MultiEdit",...},{matcher:"Edit|Write|Read",...saveFileIfNeeded}],
       PostToolUse:[{matcher:"Edit|Write|MultiEdit",...findDiagnosticsProblems}]},
settingSources:[...R.kind==="trusted"?j$e:G$e],
extraArgs:{debug:null,"debug-to-stderr":null,"enable-auth-status":null,"no-chrome":null,"replay-user-messages":null,...}
```
with `j$e=["user","project","local"],G$e=["user"]` (an untrusted workspace gets user settings only).

The SDK transport turns these into flags (`extension.js`, `initialize()`):

```
let X=["--output-format","stream-json","--verbose","--input-format","stream-json"];
if(c){switch(c.type){case"enabled":if(c.budgetTokens===void 0)X.push("--thinking=adaptive");
  else X.push(jn("--max-thinking-tokens",c.budgetTokens));break;case"disabled":X.push("--thinking=disabled");...}
  if(c.type!=="disabled"&&c.display)X.push(jn("--thinking-display",c.display))}
if(this.options.effort)X.push(jn("--effort",this.options.effort));
...if(h)X.push(jn("--model",h));
if(N){... X.push("--permission-prompt-tool=stdio")}
if(T)X.push(jn("--resume",T)); ... if(w!==void 0)X.push(jn("--setting-sources",w.join(",")));
if(_)X.push(jn("--permission-mode",_)); if(b)X.push("--allow-dangerously-skip-permissions");
if(F)X.push("--include-partial-messages");
```

At the main launch site the model argument is `void 0`, and thinking is `tZ(o, showThinkingSummaries, …)`:
```
this.spawnClaude(y,t,async(ut,ir,Kt)=>…, void 0, T, r, p, tZ(o,this.getShowThinkingSummariesSetting(),this.thinkingSummariesDefaultOn()), …)
function tZ(e,t,n){if(e==="off")return{type:"disabled"};return{type:"enabled",budgetTokens:eZ,display:t??n?"summarized":void 0}}
… eZ=31999
```
So a normal session launches with **no `--model`** (the CLI resolves `model` from settings), with
`--max-thinking-tokens 31999` (or `--thinking=disabled`), and **no `--effort`** (effort comes from settings).

Resulting command line (typical, trusted workspace):
```
claude --output-format stream-json --verbose --input-format stream-json --max-thinking-tokens 31999
  --permission-prompt-tool=stdio [--resume <id>] --setting-sources user,project,local
  [--permission-mode <mode>] --include-partial-messages --debug --debug-to-stderr --enable-auth-status
  --no-chrome --replay-user-messages
```

Environment it sets (`extension.js`):
```
n.CLAUDE_CODE_ENABLE_TASKS="0",n.CLAUDE_CODE_EMIT_STARTUP_TIMING="1",n.CLAUDE_CODE_STARTUP_FAILURE_RESULTS="1";
for(let o of t){... n[o.name]=o.value||""}   // claudeCode.environmentVariables
... if(r!==void 0)n.CLAUDE_CONFIG_DIR=r; ... n.CLAUDE_CODE_ENTRYPOINT="claude-vscode",
n.CLAUDE_CODE_HOST_READS_NO_BASH_EDIT_DIFF="1",delete n.CLAUDECODE,delete n.CLAUDE_CODE_CHILD_SESSION,...
```
It also sets `CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS:"1"` (behind a flag), and
`CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1` when resuming an interrupted turn. The bundled binary is
`resources/native-binary/claude.exe` (version string `"2.1.330"`). Every stdin control message is
`{"type":"control_request","request_id":<uuid>,"request":{"subtype":…}}`; for example:
`n={type:"control_request",request_id:bf.randomUUID(),request:{subtype:"mcp_message",…}}`.

## 2. Model switching

**UI.**
- A **model pill** in the prompt box footer: the button title is "Switch model". Its label is the model's
  display name, followed by the effort level and, when on, "· Ultracode"
  (`HAe({label,effort,ultracode,…})`, `title:a&&e?`Switch model (${e})`:"Switch model"`).
- Clicking it opens a popup with the heading **"Select a model"**. Each row shows `displayName` and
  `description`; the current model has a check mark. Unavailable models are greyed out. The popup shows
  "Loading models…" and "No models available" when the list is empty, and has an **Effort** row and an
  **Ultracode** row at the bottom. Arrow keys, Enter and Space work in it.
- Also reachable from the `/` command menu as **"Switch model…"** ("Change the AI model", Model section),
  and by typing `/model` (docs: "typing `/model` on its own in the prompt box opens the picker too",
  https://code.claude.com/docs/en/vs-code).
- **The list comes from the CLI.** It is `availableModels:e.drawnClaudeConfig.value?.models` and
  `unavailable_models`. In the SDK, `async supportedModels(){return(await this.initialization).models}`,
  so the model list is part of the `initialize` control response. A `"default"` entry exists; picking it
  clears the setting.

**Mechanism.** Webview `set_model` → host `setModel`:
```
async setModel(e,t){… let n=await this.writeUserSettingsAndPush(e,{model:t.value==="default"?null:t.value});
  return{type:"set_model_response",...n!==void 0&&{applied:n}}}
```
`writeUserSettingsAndPush` writes the keys into `~/.claude/settings.json` (`_t.join(d,"settings.json")`,
`d` = the config dir) and then sends `await s.query.applyFlagSettings(t)` → control request
`{subtype:"apply_flag_settings",settings:{model:…}}` to the **running** CLI, and re-reads
`get_settings`. There is **no restart** and no `/model` text command. The SDK also has
`setModel(e){await this.request({subtype:"set_model",model:e})}`, but the extension's model picker uses
`apply_flag_settings`. **Persisted default:** the `model` key in user `settings.json`, so the next session
starts with that model.

When the new model does not support auto mode, the CLI drops to `default` and emits
`system/status` with `permissionMode:"default"` (docs: agent-sdk/permissions, "Auto mode").

## 3. Effort and thinking

**Effort UI.** Effort shows only when the current model `supportsEffort`. The levels come from the
model entry's `supportedEffortLevels`, falling back to `["low","medium","high"]`. Labels:
`{low:"Low",medium:"Medium",high:"High",xhigh:"Extra high",max:"Max"}`, and an unset level shows "Auto".
It appears in three places:
- In the model picker, as an "Effort" row with a slider (`Mle`, "Click or drag to set effort level").
- In the permission-mode menu, below the modes: "Effort (High)" plus the slider. Clicking the row
  cycles the level (`title:"Click to cycle effort level"`).
- In the `/` menu, Model section: "Effort", "Set how hard the model tries".
- The model pill also shows the selected level.

**Effort mechanism.** `setEffortLevel` → `applySettings({effortLevel:e})` → host
`writeUserSettingsAndPush`, which first tries
`saveEffortLevelThroughCli: await e.query.updateSettings("userSettings",{effortLevel:t})` and then
`applyFlagSettings({effortLevel})` on the live process. No restart. The CLI accepts `--effort
<low|medium|high|xhigh|max>` at launch (`claude --help`), but the extension doesn't use it. The docs
say a picked level other than `max` "saves it for the current model as your default, under
`modelSettings` in your user settings; `max` applies to the current session only". (UNCONFIRMED in
the code: the bundle sends `effortLevel`, and the CLI does the per-model `modelSettings` mapping.)

**Ultracode** is a separate switch under Effort ("Run dynamic workflows on every task (this session
only)"). It is sent as `applySettings({[flag]:true},{flagsOnly:true})`, so it is never saved.

**Thinking.** There is a **"Thinking"** toggle in the `/` menu, Model section ("Toggle extended thinking
mode"). It is only shown when the model `currentModelSupportsThinkingOff`. It sends host
`set_thinking_level` and then:
```
if(n.type==="enabled")await r.query.setMaxThinkingTokens(n.budgetTokens??eZ,n.display??null);
else await r.query.setMaxThinkingTokens(0); return await this.settings.setThinkingLevel(t)
// SDK: {subtype:"set_max_thinking_tokens",max_thinking_tokens:e,thinking_display:t}
```
(31999 when on, 0 when off). The choice is saved by the extension for the next launch (UNCONFIRMED where
exactly; likely VS Code storage, not `settings.json`). Thinking summaries come from the
`showThinkingSummaries` setting.

**ultrathink.** The CLI handles it as a keyword. The webview only highlights the word in the input
(decoration kind `"ultrathink"`) when `system/init` reports `ultrathink_available`.

## 4. Permission modes

**UI.** A footer button on the right of the prompt box shows the current mode's icon and label. Its
tooltip is `${description}. Click to change, or press Shift+Tab to cycle.` The menu is headed
**"Modes"** with the hint "⇧ + tab to switch". Labels and descriptions (`webview/index.js`):

| mode | label | description |
| --- | --- | --- |
| `default` | Manual | Claude will ask for approval before making each edit |
| `acceptEdits` | Edit automatically | Claude will edit your selected text or the whole file |
| `plan` | Plan | Claude will explore the code and present a plan before editing |
| `auto` | Auto | Claude will approve actions that pass a safety check and pause for anything risky |
| `bypassPermissions` | Bypass permissions | Claude will not ask for approval before running potentially dangerous commands |
| `dontAsk` | Don't ask | Claude will deny actions that need approval instead of asking |

**Cycle order for Shift+Tab** (`zt()`):
```
let ce=["default","acceptEdits","plan"]; if(mode==="dontAsk")ce.unshift("dontAsk");
if(auto available)ce.push("auto"); if(bypass allowed)ce.push("bypassPermissions");
```
Shift+Tab in the input picks `ce[(idx+1)%ce.length]`. Bypass is listed only when
`claudeCode.allowDangerouslySkipPermissions` is on. The host refuses bypass otherwise:
"Refusing set_permission_mode … allowDangerouslySkipPermissions is off".

**Mechanism.** Host `setPermissionMode` → `o.query.setPermissionMode(t,…)` → control request
`{subtype:"set_permission_mode",mode, answers_bypass_switch_back}`, live with no restart (docs:
https://code.claude.com/docs/en/agent-sdk/permissions, "During streaming"). A user-initiated change to
`default`, `auto` or `acceptEdits` is saved as the default for new sessions (`persistDefaultPermissionMode`
→ `this.settings.setPermissionMode(e)`). That most likely means the `claudeCode.initialPermissionMode`
setting (UNCONFIRMED exact key). Modes are also remembered per session (`persist_session_permission_mode`).
Plan approval buttons: "Yes, and use auto mode" / "Yes, and auto-accept" / "Yes, and manually approve
edits" / "No, keep planning".

## 5. Approvals

**Transport.** `--permission-prompt-tool=stdio`. The CLI sends a `control_request` with
`subtype:"can_use_tool"`, carrying `tool_name`, `input`, `permission_suggestions`, `blocked_path`,
`decision_reason`, `title`, `display_name`, `description`, `tool_use_id`, `agent_id` and more. The SDK
calls `canUseTool(tool_name,input,{suggestions,…})` and answers with the result plus `toolUseID`:
```
let r=await this.canUseTool(e.request.tool_name,e.request.input,{signal:t,suggestions:e.request.permission_suggestions,…});
return{...r,toolUseID:e.request.tool_use_id}
```
The host forwards it to the webview as `{type:"tool_permission_request",toolName,inputs,suggestions}`.
The webview resolves it as:
```
accept(e={},t=[]){… this.resolved.emit({behavior:"allow",updatedInput:e,updatedPermissions:t})}
reject(e,t){this.resolved.emit({behavior:"deny",message:e,interrupt:t})}
```
So the answer is `allow` + `updatedInput` + `updatedPermissions` (the chosen suggestion or rule), or
`deny` + `message` (the feedback text) + `interrupt`.

**What the user sees.** The generic header reads "Do you want to proceed with **<Tool>**?", with a
collapsible "Details" section showing the input. Tool-specific renderers exist, for example diffs. The
numbered buttons are:
1. **Yes**
2. **"Yes, allow <rule> for <destination>"** (or "… <rule1> and <rule2> for …", or "and N more").
   For directories: "Yes, allow access to <dir> for …". Without suggestions it reads "Yes, and don't ask
   again". For a mode-change suggestion: "Yes, allow all edits this session" or "Yes, return to normal
   mode". Clicking the destination word cycles where the rule is saved:
   `{session:"this session", localSettings:"this project (just you)", projectSettings:"this project (shared)", userSettings:"all projects"}`
   (tooltips: "Only for this session (not saved)", "Saves to .claude/settings.local.json (gitignored)",
   "Saves to .claude/settings.json (shared with team)", "Saves to ~/.claude/settings.json").
3. **No**, with a text box "Tell Claude what to do instead" (sends the deny `message`). The hint reads
   "Esc to cancel".

Number keys 1/2/3 are shown as shortcuts. With `escapeStopsClaude`, Esc declines prompts.

## 6. Account and usage

**Where.**
- An **"Account & usage…"** dialog (`/` menu: "View account info and usage"; docs: run `/usage`). Its
  "Account" section has rows **Auth method** ("Claude AI", "Anthropic Console", "API Key", "Amazon
  Bedrock" …), **Email**, **Organization** and **Plan**. Its "Usage" section has bars "Session (5hr)",
  "Weekly (7 day)", "Weekly Sonnet" (Max/Team), and "Weekly <model>" for model-scoped limits, each with a
  reset time. A Day/Week toggle shows local session totals. For API-key or 3P logins it shows cost,
  durations, code changes and "Usage by model" instead.
- The **sessions sidebar** has an "Account & usage" header with the same bars ("Session (5hr)",
  "Weekly (7 day)", plus an overage window).
- The **context-usage indicator** sits in the prompt footer and appears above `contextUsageThreshold`
  (50% by default). Clicking it offers `/compact`. Limit names in notices:
  `{five_hour:"5-hour limit",seven_day:"weekly limit",seven_day_opus:"weekly Opus limit",seven_day_sonnet:"weekly Sonnet limit",…}`.

**Data sources.**
- The `get_usage` control request (`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` →
  `{subtype:"get_usage", skip_behaviors?}`) returns `rate_limits` (`five_hour`, `seven_day`, … with
  `utilization` and `resets_at`), `subscription_type` and session totals. The usage meter is refreshed
  through `relayUsageWindowsFromProcess`.
- The stream event `rate_limit_event` pushes live updates: `if(Y.type==="rate_limit_event"&&Y.rate_limit_info.unifiedWindows) this.relayPanelUsageWindows(...)`.
- Account: `accountInfo(){return(await this.initialization).account}` (initialize response), plus a
  `claude auth status --json` probe (`Gs(e,["auth","status","--json"])`) and the `--enable-auth-status`
  stream. The context meter uses `get_context_usage`.
- The extension does not call `/api/oauth/usage` itself (no such string found). That is UNCONFIRMED
  only in the sense that the CLI might call it internally to answer `get_usage`.

**Multiple accounts.** There is no switcher between saved accounts. The `/` menu offers **"Switch
account"** ("Log in with a different account", which runs the login flow again through
`claude_authenticate` / OAuth control requests) and **"Sign out"**. A different config dir is only
possible by setting `CLAUDE_CONFIG_DIR` in `claudeCode.environmentVariables` (the host honours it:
`n.CLAUDE_CONFIG_DIR=r`). When the account changes, the extension discards stale usage reads:
"usage meter read discarded: the account changed meanwhile".

## 7. Other control requests and daily-use UI

Control requests the bundled SDK and extension send: `initialize`, `interrupt` (optional
`cancel_queued`), `set_model`, `set_permission_mode`, `set_max_thinking_tokens`, `apply_flag_settings`,
`update_settings`, `get_settings`, `get_usage`, `get_context_usage`, `get_status`, `mcp_status`,
`mcp_toggle`, `mcp_reconnect`, `mcp_set_servers`, `mcp_authenticate`, `rewind_files`, `stop_task`,
`get_task_output`, `background_tasks`, `generate_session_title`, `rename_session`,
`export_conversation`, `reload_plugins`, `reload_skills`, `list_permission_rules`, `side_question`
(/btw), `claude_authenticate`, `claude_oauth_callback`, `set_prompt_suggestions_paused`, `set_cwd` and
others. Model and agent lists come from the `initialize` response (`models`, `agents`).
**Stop** = `interrupt` (the Stop button calls `e.interrupt()`; Esc does too when `escapeStopsClaude`).

**Prompt box footer, left to right:** attach / @-mention menu ("Add files or folders to the
conversation", "Attach files from your computer", "Add browser tabs") · `/` command menu button ("Show
command menu (/)") · context-usage indicator · remote-control pill · **model pill** (model + effort) ·
editor-selection chip · spacer · **mode picker** (with the effort row) · Stop/Send.

**`/` command menu sections:** Context (Attach file…, Mention file…, Clear conversation, Rewind,
Export, Resume conversation …), Model (Switch model…, Effort, Thinking, Ultracode, Toggle fast mode,
Account & usage…), Customize (Output styles, MCP servers, Hooks, Memory, Instructions, Permissions,
Manage plugins …), Settings (Focus view …), Support. It also includes "Slash commands" for the CLI's
own `/` commands.

**Sessions:** a "Session history" button with search, AI-generated titles, rename/archive on hover, and
automatic archiving after 14 days (`claudeCode.archiveInactiveSessions`). There are "New conversation"
and "Resume conversation" commands.

**Keybindings (package.json):** Ctrl+Esc focus/blur input, Ctrl+Shift+Esc open in new tab, Alt+K insert
@-mention, Ctrl+N new conversation (opt-in `enableNewConversationShortcut`), Ctrl+Shift+T reopen closed
session, Ctrl+Alt+F focus view. In the input: Shift+Tab cycles mode, Shift+Enter adds a newline, Tab
accepts a prompt suggestion, Esc stops Claude or closes menus.

---

## Implications for command center

| Concern | VS Code extension | Command center today (`src/main/claude/session.ts`, `src/main/permission/`, `SessionHeader.tsx`, `UsageStrip.tsx`) |
| --- | --- | --- |
| Model | Model pill in the input footer; list from the `initialize` response `models`; live `apply_flag_settings {model}` plus a write to user `settings.json` as the default | `--model` only at session creation; changing it means a new session |
| Effort | Slider/cycle using the model's `supportedEffortLevels`; live `apply_flag_settings {effortLevel}` / `update_settings` | none |
| Thinking | "Thinking" toggle → `set_max_thinking_tokens` 31999/0; launch `--max-thinking-tokens 31999` | none (CLI default) |
| Permission mode | Footer picker plus Shift+Tab cycle; live `set_permission_mode` | `--permission-mode` at spawn; header popover |
| Approvals | `--permission-prompt-tool=stdio` → `can_use_tool` control_request on the same pipe; answer with `updatedPermissions` for "don't ask again" and a deny `message` for feedback | PreToolUse hook via `--settings` → localhost HTTP server |
| Stop | `interrupt` control request (process stays alive) | `SIGINT` to the child |
| Usage | `get_usage` control request plus `rate_limit_event.unifiedWindows`; 5h / weekly bars | `rate_limit_event`s per profile (`UsageStrip`) |
| Account | initialize `account` and `claude auth status --json`; single account, "Switch account" = re-login | multiple profiles (separate config dirs) — **command center already does more here** |

Concrete changes to mimic it:
1. Add a control-request channel to `session.ts`: write `{"type":"control_request","request_id",…}`
   lines to stdin and match `control_response` replies by `request_id`. Everything below depends on it.
2. Read `models` (with `supportsEffort` / `supportedEffortLevels`) and `account` from the `initialize`
   response and drive the model picker and effort control from them, instead of a hard-coded model list.
   UNCONFIRMED: whether a raw-CLI host (not the SDK) must send `initialize` itself to get that response.
   The SDK always does.
3. Switch the model and effort live with `apply_flag_settings` (or `set_model`), with no respawn. Decide
   whether to also save them as a per-profile default. The extension writes the user `settings.json`,
   which in command center would leak across sessions of the same profile.
4. Add a Thinking toggle (`set_max_thinking_tokens`) and launch with `--max-thinking-tokens 31999` to
   match the extension's default.
5. Change the permission mode live with `set_permission_mode`. Add Shift+Tab cycling in the input in the
   order Manual → Edit automatically → Plan → (Auto) → (Bypass), and use the extension's labels.
6. Consider replacing the PreToolUse hook and localhost server with `--permission-prompt-tool=stdio` plus
   `can_use_tool` handling. This removes the server and settings file, gives `permission_suggestions` for
   the "Yes, allow X for this session / this project / all projects" button, and allows deny feedback.
   This is the extension's approach and makes the hook's "outside the app" problem (commit 5c98092)
   impossible.
7. Replace SIGINT with the `interrupt` control request.
8. Keep the per-profile usage strip. Add a `get_usage` pull at session start for an immediate reading
   instead of waiting for the first `rate_limit_event`, and label the windows "Session (5hr)" and
   "Weekly (7 day)".

## UNCONFIRMED

- The exact storage key for the saved default permission mode (likely `claudeCode.initialPermissionMode`)
  and for the thinking on/off choice.
- Whether effort is stored as `effortLevel` or per-model `modelSettings`. The code sends `effortLevel`;
  the docs say `modelSettings`. The CLI probably maps one to the other.
- Whether a raw `claude -p --input-format stream-json` host without the SDK gets the
  `models`/`account` lists without sending `initialize` first.
- Whether the CLI uses `/api/oauth/usage` internally to answer `get_usage`. The extension never calls it
  directly.
- The exact JSON envelope of the `control_response` the SDK writes back for `can_use_tool`. The payload
  fields are confirmed (`behavior`, `updatedInput`, `updatedPermissions`, `message`, `interrupt`,
  `toolUseID`); the outer `{"type":"control_response","response":{"subtype":"success","request_id",
  "response":…}}` shape is inferred from the reader side (`e.type==="control_response"`,
  `e.response.request_id`, `s.subtype==="success"`).
