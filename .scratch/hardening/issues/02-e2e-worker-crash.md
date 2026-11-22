# 02: The e2e run sometimes crashes its own test worker

**What to build:** about 1 full `pnpm e2e` run in 7 fails because the Playwright worker process dies with code 3221226505 (0xC0000409, a fast-fail/stack-buffer-overrun abort), reported on the next test at 0 ms. The app is not at fault as far as is known: launch-only loops (120 in a row) never hit it, and it leaves no Windows error event or crash dump. Find the root cause and make full runs reliable.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Reproduce reliably (repeated full runs; note which test precedes the crash and what it tears down)
  - 0 in 14 full runs, then 4 in 159 short fresh-worker runs (tests 1-4, three runs in parallel). It hits any test, the first one included, so no teardown is involved: the worker dies while it connects to the app it just launched.
- [x] Capture evidence of what aborts (e.g. Node/WER crash dumps for the worker, `--trace` output, Playwright `DEBUG=pw:*` near teardown)
  - No WER dump because libuv sets SEM_NOGPFAULTERRORBOX in every Node process. With ProcDump attached to each worker, two full dumps were taken. Symbolised with Node's PDB, both show the same stack: `TCPWrap::Connect` → `uv_tcp_connect` → `uv__tcp_connect` → `__report_gsfailure` (fast-fail code 2, stack cookie). `DEBUG=pw:browser` shows it on `<ws connecting>` to the app's DevTools port.
- [x] Root cause stated; fix it in the harness or config (Node version, worker count, teardown order, a native module in the worker); a retry is acceptable only as a last resort and only if the crash is proven to be outside the app
  - Root cause: a bug in Node itself. On Windows, Node 24.15's libuv checks the Windows version on every loopback connect. It calls RtlGetVersion with the struct size left uninitialised, so the call can write past the stack buffer (nodejs/node#63620; fixed in 24.16 by cherry-picking libuv aabb765). Node 22.23.5 has the same unpatched code. Fix: run on Node 24.16 or later. `pnpm e2e` now prints a warning on an affected Node (decision 60). No retry was added.
- [x] Proof: 10 consecutive full `pnpm e2e` runs green
  - On a portable Node 24.22.3: 147 of 147 short stress runs clean, and 10 of 10 full `pnpm e2e` runs green (21 passed each). The machine's Node is still 24.15.0 and needs an upgrade.
