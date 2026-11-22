# 01: Clicking around feels laggy

**What to build:** Andreas reports that clicking through the app's options feels laggy (0.1.1, installed build). Measure where the time goes, fix the biggest causes, and prove it with numbers.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Measure first, on the built app with realistic seeded data (reuse `e2e/shots/` seeding: 4 repos, many tickets, several sessions; add a couple of long chat transcripts of ~300 messages each with code blocks):
  - time from click to the next painted frame for:
    - switching Dashboard ↔ Work ↔ Board (Ctrl+1/2/3 and clicks);
    - opening a chat from the Work list;
    - opening the model, mode and slash menus;
    - opening Settings and switching its tabs;
    - opening a board card's panel;
    - typing in the prompt box (per-keystroke cost).
  - Use Playwright with the Chrome DevTools Protocol (Performance / Tracing) or `performance.now()` + `requestAnimationFrame` probes. Record the median and worst of ~10 tries per action in `.scratch/perf/baseline.md`.
- [x] Find the causes and record evidence for each (profile flame excerpts, render counts): React re-renders from broad zustand selectors, persisted stores writing localStorage on every change (drafts and scroll positions were just added), IPC polling or file reads on mount (board, usage, past sessions), Markdown/highlighting re-parsed on every render, unvirtualized long lists, main-process work blocking IPC.
- [x] Fix the top causes, each with a test where it's a logic change (e.g. the persist throttle and selector equality). No visual changes.
- [x] Re-measure the same actions and add an after column to `.scratch/perf/baseline.md`. Target: each click action under 100 ms to the next frame, and typing under 16 ms per keystroke, with the long transcripts open.
- [x] Add a perf smoke check only if it's stable, for example "switching views on seeded data stays under N ms", kept out of `pnpm quick`.
