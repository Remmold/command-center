# 04: Streaming replies redraw only what changed

**What to build:** while a reply streams in, only the streaming message redraws, at most once per frame; the prompt box and the rest of the chat stay still, so typing during a reply stays instant. Streaming looks the same as today. Spec: `.scratch/typing-lag/spec.md` (Implementation Decisions: streaming redraw).

**Blocked by:** 01

**Status:** in-progress

- [x] Streamed deltas for a session are gathered and applied at most once per animation frame.
- [x] The prompt box is memoised with stable callbacks so streaming and item commits do not re-render it.
- [x] The chat item list keeps its derived data and the tool rows' context stable for committed items, so a delta re-renders only the streaming message.
- [x] Text still appears as it arrives; thinking and tool-use blocks still stream as today.
- [x] Tests for any logic change (e.g. the per-frame delta gathering) at the highest seam available.
- [x] Ticket 01's check: the streaming scenario passes (no key over 50 ms and p90 under 20 ms); record the after numbers in `.scratch/typing-lag/baseline.md`.
