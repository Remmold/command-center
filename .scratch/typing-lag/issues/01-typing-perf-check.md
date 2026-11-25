# 01: A permanent check that catches typing lag

**What to build:** a perf check in the existing perf harness (`e2e/shots`) that measures how fast keystrokes in the prompt box land while sessions work, with a large saved history. Today it must fail on the tool-call scenario; later tickets make it pass. Spec: `.scratch/typing-lag/spec.md`, Testing Decisions seam 4.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] Starting point: the research spec `.scratch/typing-lag/research/typing.shots.ts` (with its config), moved into the harness beside `perf.shots.ts`, sharing its seed where it can.
- [x] Seeded with ~20 MB of chat history (about 30 extra 300-message transcripts); 120 keystrokes, focusing the textarea rather than clicking it.
- [x] Scenarios: a fake-CLI tool-call turn (text plus tool_use, one call per second) and a streaming text turn in a visible 300-message chat.
- [x] Limits for each scenario: **no key over 50 ms and p90 under 20 ms**. Bounds the p90 and the worst key, not the median (the median stayed at 6 ms in the bad case).
- [x] Not part of `pnpm quick` and not part of the e2e suite; run at ship time. The run command goes in the file header and in `.scratch/typing-lag/baseline.md`.
- [x] Run it on the current code and record the per-scenario median / p90 / worst / keys over 50 ms in `.scratch/typing-lag/baseline.md` (expected: tool-call scenario red, around 456 ms p90 / 621 ms worst). Commit the check even though it is red; say so in the commit message.
- [x] The window may not reach the internet (fake CLI only).
