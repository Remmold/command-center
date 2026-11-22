# 02: The e2e run sometimes crashes its own test worker

**What to build:** about 1 full `pnpm e2e` run in 7 fails because the Playwright worker process dies with code 3221226505 (0xC0000409, a fast-fail/stack-buffer-overrun abort), reported on the next test at 0 ms. The app is not at fault as far as is known: launch-only loops (120 in a row) never hit it, and it leaves no Windows error event or crash dump. Find the root cause and make full runs reliable.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Reproduce reliably (repeated full runs; note which test precedes the crash and what it tears down)
- [ ] Capture evidence of what aborts (e.g. Node/WER crash dumps for the worker, `--trace` output, Playwright `DEBUG=pw:*` near teardown)
- [ ] Root cause stated; fix it in the harness or config (Node version, worker count, teardown order, a native module in the worker); a retry is acceptable only as a last resort and only if the crash is proven to be outside the app
- [ ] Proof: 10 consecutive full `pnpm e2e` runs green
