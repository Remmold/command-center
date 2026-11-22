# Click latency: baseline and after

Built app (`pnpm build`), fake CLI, seeded with `e2e/shots/seed.ts`: 4 repos plus a worktree, their tickets, 4 sessions, two of them holding a 300-message transcript (each assistant message has a list, inline code and a 30-line TypeScript block). Window 1440×900. 10 tries per action (50 keystrokes, 50 Settings tab switches).

Measured by `e2e/shots/perf.shots.ts`: a capture listener takes the `click`/`keydown` event's timestamp; the time is until the first frame after which three frames in a row come under 25 ms ("settled"), so work that lands after the first frame counts too. Clicks are raw mouse events at the target's centre, so Playwright's locator checks stay outside the timed span.

Run: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts perf` (about 1 min after the fix; `PERF_TRIES`, `PERF_PROFILE`, `PERF_OUT` in the file header).

| Action | Before median / worst (ms) | After median / worst (ms) |
| --- | --- | --- |
| Ctrl+1 Dashboard | 3429 / 3938 | 28 / 35 |
| Ctrl+3 Board | 3407 / 4260 | 11 / 103 |
| Ctrl+2 Work | 3469 / 4848 | 26 / 29 |
| click Dashboard | 3547 / 3950 | 30 / 32 |
| click Board | 3467 / 4939 | 12 / 15 |
| click Work | 3501 / 3939 | 30 / 38 |
| open chat from Work list | 3477 / 4254 | 42 / 86 |
| open model menu | 11 / 24 | 8 / 10 |
| open mode menu | 10 / 24 | 8 / 21 |
| open slash menu (type /) | 9 / 14 | 7 / 10 |
| keystroke in prompt box | 7 / 45 | 6 / 9 |
| open Settings | 6767 / 8790 | 13 / 22 |
| switch Settings tab | 3427 / 7392 | 7 / 20 |
| open board card panel | 10 / 18 | 9 / 11 |

## Causes, in the order they were fixed

1. **Every message re-parsed and re-mounted on any app-level change.** `App` re-renders on a view or Settings change, `WorkView`, every mounted `ChatView` (all sessions stay mounted) and every `Message` re-render with it, and `Markdown` ran remark + rehype-highlight (`detect: true`) again for each message. Its `components` object was built inline, so each render also gave React new element types and the whole Markdown DOM was torn down and rebuilt. CPU profile of Ctrl+1 before: highlight.js `exec`/`compileMode`/`compileKeywords`, unist `visitParents`, `removeChild`/`appendChild`, GC. Fix: module-level plugins and components, `memo` on `Markdown`, `Message`, `ChatView`, `WorkView`. Ctrl+1: 5.4 s → 0.86 s (2 tries), Settings open 8.5 s → 0.28 s, then → 22 ms with the other memos.
2. **A new `Intl.DateTimeFormat` per timestamp per render** (`messageTime.ts` `formatter`, 69–116 ms self time per view switch). Fix: one cached formatter per options and zone; test in `messageTime.test.ts` (150 constructions → ≤ 3).
3. **Layout of whole long transcripts when a chat is shown.** With the JS gone, Work ↔ Dashboard still took ~450–600 ms and opening a chat ~900 ms, all native time ("(program)" in the profile, no JS frames). Showing a chat lays out every message (~100k nodes per 300-message chat). Fix: `content-visibility: auto` per message (`.lazy-render` in `index.css`), so only messages near the viewport are laid out and painted. A chat that reopens at a saved mid-transcript scroll place renders all messages once first (`data-restoring` in `useFollowOutput`), so the saved offset still lands on the same message. Tried and dropped: `content-visibility: hidden` on hidden panes and on the Work view (no gain once messages render lazily).

## Checked and not a cause of the click lag

- Model, mode and slash menus, board card panel, typing: already under 16–25 ms before.
- No long tasks while idle (10 s `longtask` observer on the seeded app).
- Draft saving writes a small `command-center.restore` entry per keystroke: keystrokes stay at 6–9 ms.
- Not measured here (not on a click path): `command-center.chat-items` persists every transcript in one localStorage entry on each new item (about 1 MB with the two seeded chats).
