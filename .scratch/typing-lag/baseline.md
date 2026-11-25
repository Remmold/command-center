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
