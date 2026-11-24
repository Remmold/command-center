# 03: The Agents tab must not slow the app down

**What to build:** Andreas (2026-11-24), on 0.1.18: "I'm experiencing lag inside Command Center." Measured:
- the window's renderer process used about 650 CPU-seconds and about 536 MB;
- his long chat has **222 agents** (446 files in `~/.claude/projects/C--projects-personal-command-center/94ac3789-…/subagents/`).

Cause, in `src/main/claude/subagentWatch.ts` (still in 0.1.19):
- every `agent-<id>.jsonl` gets its own `TranscriptFollower`, each with its own 2-second `setInterval`;
- each sends its initial items (`INITIAL_ITEMS`) and every new line to the renderer, where `subagentTailsStore` keeps up to 2,000 items per agent.

So 222 timers stat and read files every 2 s, and hundreds of thousands of items sit in the window's memory.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Read finished agents once:**
  - On first sight, read the agent's file once.
  - If the 0.1.19 rules say it has finished (handback, interrupt, final reply, or ended because it's stale with no live process), emit a **summary** row (name, status, start and end, tool count, report excerpt, last "now" line) and attach **no follower**.
  - Only agents still working get followed. A followed agent that finishes is unfollowed.
- [x] **One timer:** a single shared poll loop, per watcher or per app, steps through the followed files; no timer per file. Keep the cadence at 2 s for working agents.
- [x] **Summaries in the renderer, full items on demand:**
  - The list, the inline Agent rows and the bar use summary rows only.
  - An agent's full items are loaded only when its live view opens: read its file, then follow it while it's open and working. Drop them when the view closes, keeping at most a small LRU of 3.
  - The renderer store must not hold the items of agents not on screen.
- [x] **Main-process status check:** the 60 s check must reuse the summaries rather than re-reading every file. Re-read only working agents' new bytes.
- [x] **Budget, as a perf check:** add a perf-shots case with a seeded session of **250 agents** (245 finished, 5 working, realistic file sizes):
  - opening the chat and the Agents tab: under 300 ms;
  - typing while it's open: under 16 ms per keystroke;
  - renderer memory growth after opening the tab: under 60 MB;
  - main-process CPU while idle with the tab open, over 10 s: under 5%.

  Record the numbers.
- [x] **Tests:**
  - pure: the summary builder, the follow/unfollow transitions, the LRU;
  - the watcher test proves finished files get no follower and that one timer serves many files;
  - no new UI scenario.
  - Gate: quick, `e2e:gate`, perf and zoom.

## Measured (perf case "a chat with 250 agents", 245 finished agents seeded at 202 MB)

| Measure | Before (0.1.19) | After |
| --- | --- | --- |
| renderer JS heap growth after opening the tab | 205 MB | 3 MB |
| renderer private memory growth | 590 MB | 37 MB |
| main CPU, idle 10 s with the tab open (5 agents writing) | 7.5 % | 2 % |
| renderer CPU, same 10 s | 2.5 % | 1 % |
| keystroke with the tab open, median / worst | 5 / 276 ms | 5 / 19 ms |
| open the chat, median | 15 ms | 10 ms |
| open its Agents tab, median | 14 ms | 12 ms |

The memory bound is asserted on the JS heap after a forced GC; private memory is printed alongside.
