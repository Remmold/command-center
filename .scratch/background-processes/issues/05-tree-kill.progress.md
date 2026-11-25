Round 1: tree kill before stdin close (session.ts), stopAll waits for pending kills, quit held up to 3 s (quitHold.ts); unit + e2e green; committed e744d8d.
Review: switched to expect.poll, moved quitHold to src/main, per-kill 2 s limit; quick tier green, full e2e 16 passed in 1.6–1.9 min.
Blocked: UI suite over its 90 s budget (pre-existing, other 15 tests sum to about 88 s); ticket says 17 scenarios, the suite has 16.
