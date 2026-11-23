# 01: See what your subagents are doing

**What to build:** Andreas (2026-11-23), after asking a chat for 5 subagents: "there is no clear representation of the subagents or what they are doing. I want to easily be able to click and find a subagent view of what they are doing." His screenshot is `.scratch/agents-view/screenshot-0.1.11.png` (not committed; read it first). What it shows:
- each Agent row is mostly the agent's **input prompt** ("IN You are investigating…");
- a bare "Working";
- one row with **no name**;
- a static **Open transcript**.

The agents run **in the background**, so their messages never stream into the parent chat. They live in `projects/<cwd>/<session>/subagents/agent-<id>.jsonl`, which `src/main/claude/subagentTranscript.ts` already reads.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Compact Agent row:**
  - It shows the description. When the description is missing, use the `subagent_type` plus the first line of the prompt, never blank.
  - Below that, a live **"now: …"** line: the agent's latest tool call in the timeline's tool label style (e.g. "Read api/auth.ts", "Bash pnpm test"), or "thinking…", or its last text line.
  - Then elapsed time, tool count, status (working, done, failed, stopped) and the running dot.
  - The IN prompt is folded behind a small "task" disclosure. The OUT shows a one-line summary once it's done.
  - Clicking the row opens that agent's live view.
- [x] **Agents tab:**
  - A chat with subagents gets an **Agents N** tab beside Chat and Media, reusing the Media tab's tab strip, with the same show/hide rules.
  - It lists every subagent of the session, foreground and background: status first (working on top), then by start time.
  - Each row shows the name, live "now" line, elapsed time, tool count and status. Also show the subagent's own subagents nested, if any.
  - Keyboard: ↑/↓ and Enter opens.
- [x] **Live agent view:**
  - Opening an agent shows its transcript in the chat area, rendered with the same components as a chat: timeline, thinking, tool rows with IN/OUT, Markdown.
  - It **follows live** by tailing the agent's `.jsonl` with the observed-session tail reader. It's read-only.
  - The header has the agent name, status, elapsed time, **Stop agent** (the existing `stop_task`) and **← Back** to the Agents list. Esc goes back too.
  - Scroll-follow works the same as in a chat.
- [x] **Watching progress:** the live "now" line and status update from the parent stream's task events (`system/task_started` and friends) plus the tail. No polling faster than the tail's existing cadence. Background agents must update too.
- [x] **VS Code chats:** the read-only VS Code view gets the same Agents tab and live view, from the same files.
- [x] **Performance:** a chat with 5 running agents must keep the perf guard green; tailing 5 files must not re-render the main transcript. Add one perf case: 5 live agents, typing stays under 16 ms per keystroke.
- [x] **Tests:**
  - pure: the row model (name fallback, "now" line from the latest events, status and elapsed), the list order, the tail→items mapping for a subagent file;
  - the fake CLI can run 2 background subagents that write their own `.jsonl` lines over time, cloned from the schema;
  - **no new UI scenario**: extend the existing subagent scenario so the Agents tab shows 2, a "now" line changes as the fake agent works, a click opens the live view showing a new line live, Back works, and Stop sends `stop_task`.
  - The zoom check covers the Agents tab at 150% in a split.
- [x] **Scope addition (Andreas, 2026-11-23): "you have things scrolling above the message you sent me, so it feels like you are done but still working."** A background subagent's tool rows kept appending inside its Agent row above the final message.
  - Inline Agent rows no longer grow with the subagent's tool rows, foreground or background: the chat keeps the compact row; the full activity lives only in the Agents tab and live view.
  - While any subagent still runs after the main turn ended, a pinned bar at the bottom of the transcript, above the prompt box, in the working-line style: "✻ 2 agents still working · View"; View opens the Agents tab. It goes when the last one finishes, with a short "agents done" note.
  - The update busy-gate counts it only if it already counts running background tasks (log the decision).
  - The chat's status dot and Work list row show running, not idle, while background agents run.
  - Tests: a pure "still working" count; the existing subagent scenario asserts the bar shows after the turn ends while the fake background agent runs, goes when it finishes, and the transcript above does not grow.
