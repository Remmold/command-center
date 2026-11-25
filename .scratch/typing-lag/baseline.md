# Typing lag: baseline

The typing perf check, `e2e/shots/typing.shots.ts`. Run at ship time, on the built app with the fake CLI:

```
pnpm build
pnpm exec playwright test -c e2e/shots/playwright.config.ts e2e/shots/typing.shots.ts
```

(Pass the file path, not a bare `typing`: the worktree's own folder name contains "typing", so a bare filter runs every shots spec.)

Setup: one visible 300-message chat plus 30 old 300-message chats, 22.8 MB of saved chat history; 120 keystrokes per scenario into the focused prompt box, timed from keydown to the next frame. Limits per scenario: no key over 50 ms, p90 under 20 ms.

## Before the fix (2026-11-25, branch feature/typing-lag at 1165d43)

| Scenario | median ms | p90 ms | worst ms | keys over 50 ms | Result |
| --- | --- | --- | --- | --- | --- |
| tool-call turn (text plus a tool call once a second) | 6 | 477 | 671 | 40 | red |
| streaming text turn | 5 | 7 | 33 | 0 | green |

Earlier runs of the same scenarios: tool-call 5 / 478 / 843 / 38 and 5 / 494 / 827 / 35; streaming 5 / 12 / 24 / 0 and 5 / 8 / 43 / 0. The streaming worst key varies from 24 to 43 ms, close to the 50 ms limit.

## After ticket 02, history in files per session (2026-11-25, branch feature/typing-lag)

The seed now writes main's per-session history files; the check asserts the app loads 22.8 MB of history before typing.

| Scenario | median ms | p90 ms | worst ms | keys over 50 ms | Result |
| --- | --- | --- | --- | --- | --- |
| tool-call turn (text plus a tool call once a second) | 5 | 6 | 7 | 0 | green |
| streaming text turn | 4 | 6 | 34 | 0 | green |

The streaming worst key (34 ms) is still near the limit; that scenario is ticket 04's.

## After ticket 04, streaming redraws only what changed (2026-11-25, branch feature/typing-lag)

Deltas are gathered and applied once per frame, in a task just after it; the prompt box is memoised with stable props; the chat item list runs its passes over the streaming message's shape (its blocks, with text only as shown or blank), so a delta redraws the streaming message alone.

| Scenario | median ms | p90 ms | worst ms | keys over 50 ms | Result |
| --- | --- | --- | --- | --- | --- |
| tool-call turn (text plus a tool call once a second) | 5 | 6 | 8 | 0 | green |
| streaming text turn | 4 | 8 | 12 | 0 | green |

A second run: tool-call 5 / 7 / 17 / 0, streaming 4 / 7 / 17 / 0. (Applying the batch inside the frame itself instead gave streaming 9 / 11–12 / 14–18: a key's frame then waited on the streaming render.)

Redraw cost per delta, measured with a throwaway probe (not kept): the visible 300-message chat only, a reply streaming one delta every 20 ms, Chrome's performance metrics over 5 s, three runs each.

| Main-thread time per second of streaming | Before | After |
| --- | --- | --- |
| script ms/s | 223, 321, 319 | 161, 161, 182 |
| all tasks ms/s | 365, 496, 524 | 317, 303, 327 |
| layout ms/s | 14, 23, 23 | 13, 13, 15 |
| frame p90 ms | 6 | **unchanged** (6) |

What is left per delta is the streaming message's own markdown parse and code highlighting (a CPU profile of the after build: remark/unified and highlight.js on top, no transcript-wide passes).
