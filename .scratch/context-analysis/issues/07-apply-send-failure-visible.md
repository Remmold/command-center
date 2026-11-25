# 07: A failed "Apply N fixes" shows in Context and keeps the ticks

**What to build:** when Andreas presses **Apply N fixes** and the request doesn't reach a working chat, Context tells him so and keeps his ticks, so he can retry. Today the message goes to the run's chat without a check. If that chat's process then fails to start, the error shows only inside that chat in Work, and the ticks in Context are already cleared, so nothing in Context says the fixes never happened.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] If sending to the run's chat, or starting a new fix session, fails, Context shows a short error next to Apply and the ticked findings stay ticked.
- [x] The ticks are cleared only once the request has reached a chat whose process is running.
- [x] A unit test at the apply-fixes seam (`applyFixes.test.ts` is prior art) covers: chat send fails → error returned and ticks kept; new session fails to start → the same.
- [x] Quick tier green.
