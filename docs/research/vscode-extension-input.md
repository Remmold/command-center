# How the Claude Code VS Code extension handles the chat input and sessions

Researched 2026-11-21 against the installed extension `anthropic.claude-code-2.1.330-win32-x64`
(`package.json`, `extension.js` = extension host, `webview/index.js` = React UI), the official page
https://code.claude.com/docs/en/vs-code, and a control-only probe of `claude` 2.1.293 (`initialize`,
`get_context_usage`; no prompts sent). This doc follows on from `vscode-extension-controls.md` (model,
effort, modes, approvals, usage) and does not repeat it. Quotes are excerpts from minified bundles;
minified names (`Hn`, `bo`, `zi` …) are kept as they appear.

## How to mimic it (summary)

1. **Keep the input usable during a turn.** The user can type and press Enter while Claude works.
   The prompt goes to the CLI's stdin straight away and shows as a *held* (queued) user message under
   the running turn. It moves into the transcript when the CLI echoes it (`--replay-user-messages`)
   or sends `command_lifecycle state:"started"`. The send button turns into **Stop** only while the
   turn is busy *and* the input is empty.
2. **Run the `/` menu from the `initialize` command list** (`commands[]`: `name`, `description`,
   `argumentHint`, `aliases`, `builtin`). Enter runs the command at once by sending `/<name>` as
   ordinary user text. Tab puts `/<name> ` in the input so you can add arguments, and a ghost
   `argumentHint` shows after it. A few commands are handled by the UI itself (/usage, /context,
   /copy, /export, /plan, /btw …). Fuzzy search, ↑/↓ wrap round, Esc closes the menu.
3. **@-mentions are plain text** (`@src/app.ts`, `@src/` for folders, `@"path with spaces"`,
   `@file#5-10` for lines). The CLI resolves them; the webview sends no extra blocks for files.
   `@terminal:<name>` and `@browser…` are different: the webview expands them into extra text blocks.
   The file list comes from `rg --files --follow --hidden` (respecting .gitignore and `files.exclude`)
   plus the folders derived from it, ranked by a fuzzy index, at most 100 results.
4. **Attachments are content blocks placed before the prompt text**: images (jpeg/png/gif/webp) →
   `image` base64, PDF → `document` base64, text-like files → `document` with a `text` source and a
   `title`. You can paste, drop, use the attach button (any file type), or pick from the `+` menu.
5. **Input keys**: Enter sends, Shift+Enter or Ctrl+J adds a newline (the `useCtrlEnterToSend` option
   flips Enter and Ctrl+Enter). ↑ at the very start of the input recalls this session's earlier
   prompts, ↓ at the end goes forward. Esc closes a menu first; otherwise Esc stops Claude. A double
   Esc on an empty input opens the rewind picker. Shift+Tab cycles the mode. Tab accepts a prompt
   suggestion.
6. **Session history**: a panel with search, rows showing a status dot, the title (AI-generated) and
   a short age (`now`/`5m`/`3h`/`2d`/`1mo`/`1y`), and Rename/Archive on hover. Titles start as the
   first prompt and are then replaced by the CLI's `generate_session_title` result. Rename uses the
   `rename_session` control request.
7. **Daily-use extras**: a context pie appears once more than 50% of the context is used (clicking it
   sends `/compact`). Thinking blocks show as "Thinking…" / "Thought for Ns". TodoWrite renders as an
   "Update Todos" checklist. There are copy buttons on code blocks, Bash commands and whole responses
   ("Copy response"), message timestamps with day separators, a pinned prompt while scrolling, and
   VS Code toasts for permission requests only when the panel is hidden.

---

## 1. Slash-command menu

**Trigger.** Typing `/` at the start of the input **or after whitespace** opens the menu inline. The
query runs up to the caret and stops at whitespace (`webview/index.js`, `uFt`):
```
p=dFt(e,h,/(?:^|\s)@[^\s]*/gm,"@"),f=dFt(e,h,/(?:^|\s)\/[^\s/]*/gm,"/")
```
The footer `/` button (`title:"Show command menu (/)"`) opens the same menu with its own
"Filter actions…" box. Docs: "click `/` or type `/` to open the command menu."

**What it lists.** A command registry with sections in a fixed order:
```
DSn=["Context","Model","Customize","Settings","Slash Commands","Support","MCP servers"]
```
- *Extension actions* (Context: Attach file, Mention file, Clear conversation, Rewind, Export, Resume
  …; Model: Switch model, Effort, Thinking, Fast mode, Account & usage; Customize: MCP servers, Hooks,
  Memory, Instructions, Permissions, Plugins, "Slash commands" browser …). These run locally.
- *CLI commands* from the CLI's `initialize` reply. The webview reads
  `drawnClaudeConfig.value?.commands` and registers each as `slash-command-<name>` in the "Slash
  Commands" section with `label:"/name"`, `description`, `argumentHint`, `aliases` and, for plugin
  commands, `origin`:
  ```
  e.registerActions(r,"Slash Commands") … if(t==="Slash Commands")n.sort((o,r)=>o.label.localeCompare(r.label))
  ```
  The probe shows the same list from `initialize`: 108 entries with keys
  `name, description, argumentHint, builtin, aliases`. Built-ins carry `builtin:true` (e.g. `clear`
  `[reset,new]`, `compact`, `context`, `usage` `[cost,stats]`, `model`, `rename` `[name]`); skills
  and plugin commands do not (e.g. `mattpocock-skills:tdd` with alias `tdd`). When two commands share
  a name, the namespaced alias is used (`bLe`).
- *Webview-owned* commands are kept out of the CLI list and handled by the UI:
  ```
  $u={btw,chrome,bug,designLogin,feedback,help,skills,tasks,workflows,terminal,remoteControl,copy,export,fork,status,plan}
  ```
  `/usage` and `/context` open IDE dialogs instead of being sent, unless a non-built-in custom command
  of that name overrides them (`JLt`, `jW`).

**Ordering and filtering.**
- With an empty query from the button, the "Slash Commands" section is hidden unless the text starts
  with `/` (`jBn`). With an inline `/` query, every section is shown.
- With a non-empty query, Fuse.js searches across all sections:
  ```
  new UU(n,{threshold:0.3,keys:[{name:"cmd.label",weight:3},{name:"cmd.aliases",weight:2},
    {name:"cmd.id",weight:2},{name:"cmd.description",weight:0.5}]})
  ```
  It then re-ranks: exact label/alias = 0, prefix = 1, other = 2, then `sortPriority`, then score
  (`GBn`). Separators `: _ - space` are ignored when matching (`qBn=/[:_\s-]+/g`), so `mstdd` style
  word-start matching works across `mattpocock-skills:tdd`.

**Keyboard** (`aBt` → `Ue`): ↓/↑ move with **wrap-around** (`At<K.length-1?At+1:0`). Enter or Tab
selects. Esc closes. The menu scrolls the active row into view.

**How a selection is sent** (`Hn(ce,$e)`, `$e` = "chosen with Tab"):
- **Tab** on a `/`-command → the input becomes `/<name> ` with the caret after it, for arguments:
  `if($e&&tRt(ce)){ue(`${ce.label} `);return}`. Tab or Enter on a command typed mid-sentence inserts
  it in place (`wAe(y,bo,ce.label+" ")`).
- **Enter** → the `/query` text is removed from the input (`hFt`) and the command runs. For CLI
  commands that means `submit("/name")`, i.e. **sent as a normal user message**
  (`return()=>n.submit(`/${t}`)`). No control request is used.
- Text the user types by hand, e.g. `/compact keep the API notes`, is sent as one user message and
  the CLI parses it.

**Argument hints.** When the input matches `/^\/(\S+) $/`, the command's `argumentHint` is drawn as
ghost text after the caret in the mirror layer:
```
let Xr=/^\/(\S+) $/.exec(y),li=Xr?i.commandRegistry.findCommandByLabel(`/${Xr[1]}`)?.argumentHint:void 0
… li?m("span",{className:Is.argumentHint,children:li}):null
```
Each menu row shows the label, the description and the plugin origin.

## 2. @-mention menu

**Trigger.** `@` at the start or after whitespace (same regex as above). The `+` button →
"Add context" inserts `@`, and "Browse the web" inserts `@browser:`.

**Sources** (`extension.js`, `findFiles`):
```
if(t.startsWith("browser:"))return this.getMatchingBrowserTabs(e,!1); … u=await b7e(e,this.cwd) …
return[...u,...i,...a]   // files+folders, (terminals = empty array), browser tabs
```
- Files: `rg --files --follow --hidden`, plus `--no-ignore-vcs` if `claudeCode.respectGitIgnore`
  is false, plus `--glob !<pattern>` for each `search.exclude`/`files.exclude` entry (`b7e`).
  Folders are derived from the file paths and listed with a trailing `/` (`Uur`). The listing is
  cached for 5 s and ripgrep times out after 10 s (`Iur=5000`, `xur=1e4`).
- Ranking: an empty query lists the direct children of the typed folder, sorted. A query is
  searched in a fuzzy file index (`XQ.loadFromFileListAsync`), sorted by score, then exact
  basename/name matches go first and paths containing `test` drop down. At most **100** results
  (`_7e=100`). Typing `src/comp` narrows to the `src/` subtree first.
- Browser tabs (Claude in Chrome) show as `browser:<title>`. Terminals: `getMatchingTerminals` exists
  but `findFiles` passes an empty array, so terminals are **not offered in the menu** in 2.1.330
  (UNCONFIRMED whether another path offers them). The docs still say to type `@terminal:name` by hand.
- MCP resources: not found in the @ menu (UNCONFIRMED).

**Keyboard** (suggestion list): ↓/↑ wrap round; Enter or Tab choose (`t(o[d],g.key==="Tab")`); Esc
dismisses. Choosing a **folder with Tab** inserts `@dir/` with no trailing space so you can keep
drilling in. Otherwise the mention plus a space is inserted (`Bd`: `Pt=!($e&&ce.type==="directory")`).

**How it is inserted and sent.** As **text** in the prompt, shown as a chip (`inputMentionChip`).
Paths with spaces are quoted `@"…"` (`JFt`). Paths containing `#` or `"` are refused with "This path
can't be @-mentioned…". On send:
- File/folder mentions stay as text, and the CLI resolves them (docs: "Claude reads that content").
  UNCONFIRMED: whether the CLI inlines file contents for stream-json input or Claude reads them with
  a tool.
- `@terminal:<name>` → an extra block `<terminal name="…">…contents…</terminal>` (`yYt`).
- `@browser…` → `<browser_instruction>…` plus `<browser tabGroupId tabId>url</browser>` blocks (`xYt`).

**Line ranges / selection.**
- Alt+K (`claude-vscode.insertAtMention`) inserts `@path#5-10`. Ctrl+Alt+K (`claude-code.insertAtMentioned`)
  inserts `@path#L5-10` (`bEe`: `n==="L"?"#L":"#"`).
- With `attachOpenFile`/`attachSelection` on, each send automatically adds a text block in front:
  ```
  <ide_selection>The user selected the lines ${startLine} to ${endLine} from ${filePath}:\n${selectedText}\n\nThis may or may not be related to the current task.</ide_selection>
  <ide_opened_file>The user opened the file ${filePath} in the IDE. This may or may not be related to the current task.</ide_opened_file>
  ```
  The transcript later shows these blocks as "Selected code: …" chips.
- Dropping files from the VS Code Explorer inserts @-mentions; Explorer → "Claude Code: Add to Chat"
  does the same.

## 3. Images and files

**Entry points** (`webview/index.js`):
- Paste (`ma`): any clipboard item that is a file or `image/*` → attachment. Plain text is inserted
  as-is with CRLF normalised; no "[Pasted text]" collapse was found. A paste that would push the
  prompt over **50,000 characters** (`C9=50000`) is refused with "That paste is N characters over the
  limit…".
- Drop: Explorer/URI drops become @-mentions. OS files (`dataTransfer.files`) become attachments.
  Docs: "hold `Shift` while dragging them into the prompt box."
- Attach: the `+` menu "Upload from computer" and the command-menu "Attach file…" both open
  `<input type="file" accept="*/*" multiple>`.
- Attachments show as removable chips (`composerAttachments`; docs: "click the X on it").

**Formats** (`mqe`): `sq=["image/jpeg","image/png","image/gif","image/webp"]` → image. PDF → pdf.
`text/*`, json/xml/javascript/typescript MIME types, a list of source-code extensions, and files
named LICENSE/README/CHANGELOG/AUTHORS → text. Anything else is reported as unsupported. Empty files
are skipped. No size cap was found in the webview (UNCONFIRMED; the API limits still apply).

**Wire format** (`gqe`): one user message whose `content` array is, in order: the IDE
selection/open-file block → the attachments → terminal blocks → browser blocks → the prompt text last.
```
{type:"image",source:{type:"base64",media_type:f,data:h}}
{type:"document",source:{type:"text",media_type:"text/plain",data:_},title:d.file.name}
{type:"document",source:{type:"base64",media_type:"application/pdf",data:h},title:d.file.name}
```
The envelope it writes to stdin:
```
{type:"user",uuid:f,session_id:"",parent_tool_use_id:null,message:{role:"user",content:h},
 …inline_pastes?, priority?, client_composed?}
```

## 4. Input box behaviour

- **Enter / Shift+Enter** (`zi`, `er`, `eLt`): Enter sends. Shift+Enter, or **Ctrl+J** (setting
  `ctrlJInsertsNewline`, default on), inserts a newline. With `claudeCode.useCtrlEnterToSend: true`,
  Ctrl/Cmd+Enter sends and a plain Enter inserts a newline. Docs: "press `Shift+Enter` to add a new
  line without sending." The input is a `contentEditable="plaintext-only"` div that grows with its
  content.
- **History recall** (`sAt`/`QW`): ↑ recalls earlier prompts **only when the caret is at offset 0**,
  and ↓ works only at the end. The list is this session's non-synthetic, top-level user messages plus
  held prompts, newest first. Leaving history restores the draft you had. It is per-session, not
  global.
- **Esc**, in order: (1) close any open menu (slash, mention, model, mode …); (2) otherwise a
  document-level handler interrupts the active session if `escapeStopsClaude` is on (default):
  `yqe(document,()=>{…if(d.escapeStopsClaude)D.interrupt()…})`; (3) on an **empty input**, two Esc
  presses within **800 ms** (`jo=800`) open the rewind picker (`onShowRewindPicker:()=>Ri(!0)`).
- **Tab** accepts a prompt suggestion (ghost text), **Shift+Tab** cycles the permission mode.
- **Typing and sending during a turn: yes.** `send()` always writes to the CLI
  (`C.sendInput(w,_,…)`), and if a turn is running or queued it also adds the message to
  `heldPrompts`:
  ```
  if(b&&this.turnRunningOrQueued)a=f,this.heldPrompts.value=[...this.heldPrompts.value,{uuid:f,message:b,…}]
  ```
  Held prompts render under the live turn as user bubbles (`held:!0`). They are released into the
  transcript when the CLI echoes the uuid (`isReplay`) or sends
  `command_lifecycle {command_uuid, state:"started"|"completed"|"cancelled"|"discarded"|"refused"}`.
  `ran_ahead:true` marks one "Ran at once, while Claude was working." The screen reader announces
  "Message queued." UNCONFIRMED: whether a held prompt can be edited or removed before pickup. The
  controls research notes `interrupt` takes `cancel_queued`.
- **Stop button**: `if(e.busy.value&&!r)` → Stop icon, label "Stop" (`r` = there is text to send).
  When `escapeStopsClaude` is off, Stop is always offered (`alwaysOfferStop:!i.escapeStopsClaude`).
  Stop = the `interrupt` control request.
- Sending a prompt over 50,000 characters is refused with an inline notice. Invisible Unicode is
  stripped from pastes, and you are asked to review before sending.

## 5. Session history and resume

- **Where**: the "Session history" button at the top of the panel opens a list with a "Search
  sessions…" box. Groups include user-made groups (drag sessions into them), "Active · N", and
  "Archived sessions". A **Web** tab lists claude.ai cloud sessions (docs).
- **Each row** (`MWn`): a state dot (unread / running / awaiting input, tooltip like "Open in this
  window — running"), the **title** (`summary` or "Untitled", with the search match highlighted), a
  worktree pill when the session is in another worktree, and a **relative age** (`OWn`: `now`, `5m`,
  `3h`, `2d`, `1mo`, `1y`). On hover: "Rename session" and "Archive session"/"Unarchive session".
  Ctrl/Shift+Enter opens a session beside the current one.
- **Data**: the extension host builds the list with the SDK session listing
  (`listSdkSessions` → `{sessionId, summary, firstPrompt}`) plus unreadable transcript files, and
  attaches each session's remembered permission mode. Sessions idle for 14 days are archived
  automatically (`claudeCode.archiveInactiveSessions`). There is **no delete**; archiving replaced
  "Delete session" in v2.1.257 (docs).
- **Titles**: on the first send, `summary` is set to the prompt text. The webview then asks the CLI
  for a title, `generate_session_title {description:<prompt>, persist}`, up to 3 times (`Vnn=3`),
  until a persisted title exists. Rename sends `rename_session {title, source:"host", session_id}`.
- **Resume**: click a row to open the conversation. The transcript loads through
  `get_session_request`, and the CLI is spawned with `--resume <id>` (see the controls doc).
  "New conversation" (Ctrl+N, opt-in) and Ctrl+Shift+T "Reopen closed session" are commands.

## 6. Other daily-use bits

- **Context indicator** (`jBt`): a pie in the footer, shown only above `contextUsageThreshold`
  (default 50%). Its tooltip reads "N% of context remaining until auto-compact. Click to compact now."
  Clicking it sends `/compact` (`et=()=>{n("/compact",[])}`). The number is the last assistant
  message's `input + cache_creation + cache_read + output` tokens (`updateUsage`) divided by the
  context window. It resets to 0 on `system/compact_boundary`. The detailed `/context` dialog uses
  `get_context_usage`. The probe reply has `categories[] {name,tokens,color,kind}`, `totalTokens`,
  `maxTokens`, `percentage`, `gridRows`, `autocompactSource`.
- **Todos**: TodoWrite renders as a tool row headed "Update Todos" with a checklist
  (`yLt`: status icon plus content, completed items styled). The latest todo list also stays near
  the input (`Y$e`/`G$e` find the newest TodoWrite; UNCONFIRMED exact placement). The extension sets
  `CLAUDE_CODE_ENABLE_TASKS=0`, so the CLI uses TodoWrite rather than Tasks.
- **Thinking** (`GTt`): a collapsible block labelled "Thinking..." while streaming (with a live token
  estimate), then "Thought for Ns". A thinking-only fold reads "Thought for Ns".
- **Tool calls**: per-tool renderers (`class … extends ro{name=…;header();body()}`). Read, Grep,
  Glob, TodoWrite and ToolSearch count as "quiet" and fold into "N hidden steps" / "N tool calls ·
  M failed" groups. Focus view (Ctrl+Alt+F) hides tool activity entirely.
- **Copy**: copy buttons on code blocks ("Copy code"; diffs copy without +/-), on Bash commands, and
  "Copy response" on each assistant reply. `/copy [n]` copies the nth-last reply.
- **Timestamps**: `claudeCode.showMessageTimestamps` (package default `true`). A date line marks
  where the day changes.
- **Scroll**: `scrollToBottomOnSend` (default true). `pinPrompt` (default true) keeps your prompt
  pinned at the top while you scroll its reply.
- **Notifications**: VS Code toasts only when the panel is not visible (`onlyIfNotVisible`), e.g.
  "Claude is requesting permission to use <tool>", "Claude is asking you a question.", "Claude has
  finished a plan and is waiting for your review.", with a "View" button. No sounds were found in the
  webview.
- **Prompt suggestions**: ghost text after a reply; Tab accepts (`claudeCode.promptSuggestions`).

**All keybindings in `package.json`:**

| Key (Windows) | Command | When |
| --- | --- | --- |
| Alt+K | `claude-vscode.insertAtMention` (`@path#5-10`) | editor focused |
| Ctrl+Alt+K | `claude-code.insertAtMentioned` (`@path#L5-10`) | editor focused |
| Ctrl+Esc | `claude-vscode.focus` | editor focused, not terminal mode |
| Ctrl+Esc | `claude-vscode.blur` | editor not focused, not terminal mode |
| Ctrl+Esc | `claude-vscode.terminal.open.keyboard` | `useTerminal` on |
| Ctrl+Shift+Esc | `claude-vscode.editor.open` (new tab) | not terminal mode |
| Ctrl+N | `claude-vscode.newConversation` | `enableNewConversationShortcut` and Claude focused |
| Ctrl+Alt+F | `claude-vscode.toggleFocusView` | Claude panel/sidebar active |
| Ctrl+Shift+T | `claude-vscode.reopenClosedSession` | `enableReopenClosedSessionShortcut` and last closed was a session |

Handled inside the webview, not in `package.json`: Enter / Shift+Enter / Ctrl+J, ↑/↓ history,
Esc / double-Esc, Tab (suggestion), Shift+Tab (mode), and Ctrl+D dictation (docs:
`claude-vscode.toggleDictation`).

## 7. Command center today and the gap

From `src/renderer/components/chat/InputBox.tsx`, `AutocompletePopup.tsx`, `ChatView.tsx`,
`Message.tsx`, `src/renderer/components/PastSessionsModal.tsx`, `work/SessionList.tsx`,
`src/main/files/lister.ts`, `src/main/claude/session.ts`.

| Area | VS Code extension | Command center today |
| --- | --- | --- |
| Typing during a turn | Input stays editable; Enter writes to stdin and shows a held bubble; Stop only when the input is empty | `InputBox disabled={turnActive}` → textarea `readOnly`, Enter swallowed — **you cannot even draft** |
| Prompt history | ↑ at start / ↓ at end, per session | none |
| Slash source | `initialize.commands` with description, argumentHint, aliases, builtin | `system/init.slash_commands` (names only), falling back to `sessionInit.commands.map(c=>c.name)` — descriptions dropped |
| Slash trigger | start of input or after whitespace | start of input only (`value.startsWith('/')`) |
| Slash select | Enter runs `/name` at once; Tab inserts `/name ` + ghost argument hint; UI-owned commands open dialogs | Enter and Tab both insert `/name `; you press Enter again; no hints; /usage, /context, /model are not mapped to the app's own UI |
| Slash ranking | Fuse fuzzy, exact > prefix > fuzzy, sections, wrap-around arrows | substring, prefix first, 30 max, arrows clamp |
| @ file source | `rg --files` with .gitignore + excludes, folders with `/`, fuzzy index, 100 results, 5 s cache | own walker, fixed ignore list (no .gitignore), files only, 5000 cap, substring, 30 shown, 15 s cache |
| @ formatting | quotes paths with spaces `@"…"`, refuses `#`/`"`; Tab on a folder drills in | inserts `@path ` raw |
| @ terminal/browser | `@terminal:` / `@browser` expanded into blocks | none (the app has its own terminals — could map `@terminal:<pane>`) |
| Attachments | images + PDF + text files as `image`/`document` blocks; attach accepts any file | images only (`accept="image/*"`, non-images dropped silently) |
| Prompt size | 50,000-character limit with notice | none |
| Esc | closes menu → stops Claude from anywhere in the panel; double-Esc on empty input → rewind | stops only when the textarea is focused and the turn is active |
| Ctrl+J / Ctrl+Enter option | yes | no |
| Context indicator | pie above 50%, click = `/compact`; `/context` dialog via `get_context_usage` | none |
| Thinking | "Thinking…" / "Thought for Ns" collapsible | thinking blocks not rendered (`Message.tsx` renders only `text`/`tool_use`); a generic "claude is thinking…" line |
| Todos | "Update Todos" checklist | generic tool row (UNCONFIRMED whether `toolCall.ts` special-cases it — no match for `TodoWrite`) |
| Copy | code, Bash command, "Copy response" | none found in chat components |
| Timestamps | per message plus a day line | none |
| Scroll | to bottom on send, pinned prompt while reading | jumps to bottom on every new item (even while you scroll up) |
| Past sessions | panel: AI title, age, status dot, search, rename (`rename_session`), archive | modal: session id prefix + first-prompt preview + age + message count; filter; no AI title, no archive |
| Session titles | first prompt → `generate_session_title` | live tabs: renamed locally in the store only (`renameSession`), not sent to the CLI; observed sessions read `ai-title` lines |
| Notifications | toast when hidden for permission / question / plan | UNCONFIRMED (not checked outside chat components) |
| Stop | `interrupt` control request | already `interrupt` control request (`session.ts`) — **identical** |
| Shift+Tab mode cycle, model/effort/thinking pills | yes | yes — **already matches** (see controls doc) |

## Prioritised gap list (what a daily user misses first)

1. **Typing and queueing during a turn.** Keep the input editable, write the prompt to stdin at once,
   show it as a queued bubble until the CLI's replay/`command_lifecycle`, and show Stop only when the
   input is empty.
2. **↑/↓ prompt history** (per session, caret at start or end).
3. **Slash menu fidelity**: use `initialize.commands` (description, argumentHint, aliases); make Enter
   run and Tab insert, with a ghost argument hint; send `/name` as user text; route /usage, /context
   and /model to the app's own UI.
4. **Context usage pie with click-to-compact** (threshold 50%, tokens from the last assistant usage,
   reset on `compact_boundary`).
5. **Rendering of thinking, todos and copy buttons** ("Thought for Ns", the TodoWrite checklist,
   copy code and copy response).
6. **Better @-mentions**: ripgrep/.gitignore listing, folders, fuzzy ranking, quoting; plus
   `@terminal:` for the app's own terminals.
7. **Esc everywhere stops Claude**; double-Esc on an empty input → rewind (once rewind exists);
   Ctrl+J newline.
8. **Session history**: AI titles via `generate_session_title`, rename through `rename_session`,
   archive instead of delete, a status dot.
9. **Attachments beyond images**: PDF and text files as `document` blocks; the 50,000-character
   prompt limit.
10. **Scroll and timestamps**: don't yank to the bottom while the user reads; per-message timestamps.

## UNCONFIRMED

- Whether the CLI inlines `@file` contents for stream-json input or leaves Claude to read them with a
  tool (the extension sends file mentions as plain text only).
- Whether terminals appear in the @ menu through another path (in 2.1.330 `findFiles` passes `[]`).
- Whether a queued prompt can be edited or removed before the CLI picks it up.
- Where exactly the latest todo list is pinned in the view.
- Any attachment size limit in the extension (none found in the webview).
- Whether the command center shows OS notifications for approvals (only chat components were checked).
