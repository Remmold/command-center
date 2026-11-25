# 03: Output tail and local port open link

**What to build:** each background process row shows the tail of its output, refreshed while it runs. Once a local port it serves answers, the row also shows an open link for it (spec: `.scratch/background-processes/spec.md`).

Rules (from the spec, word for word):
- **Output.** While a session's Processes tab is visible, the renderer asks for each running process's output about once per second, through the CLI's `get_task_output {task_id}` control request (`{output, total_bytes, truncated}`). One last fetch happens when a process ends, and that output is kept for the ended row. The view shows the last 200 lines. No output request is sent while the tab is hidden.
- The output is shown read-only in a terminal-style view.
- **Ports.** A pure function finds local URLs in the output: `http(s)://` + `localhost`, `127.0.0.1`, `0.0.0.0` or `[::1]` + `:port`. `0.0.0.0` and `[::1]` open as `localhost`. A found port gets an open link only after a TCP connect to `127.0.0.1:<port>` succeeds (the Apps page's existing port check). The check is redone on each output refresh until it succeeds, and the link is dropped when the process ends.
- **Open.** The open link uses the existing external-open path and refuses anything that is not a local address.

**Blocked by:** 02

**Status:** in-progress

- [ ] Seam 2 unit tests for port detection: output text in, local ports out. Non-local hosts are ignored, duplicates are merged, and `0.0.0.0` / `[::1]` map to localhost.
- [ ] The output tail (last 200 lines) refreshes about once a second, only while the tab is visible. The final fetch is kept on the ended row.
- [ ] The open link appears only after the connect check succeeds. It opens externally, refuses non-local addresses, and disappears when the process ends.
- [ ] The e2e scenario from 02 is extended: the output shows, and the open link appears once the port answers. The window itself must make no http request.
- [ ] Quick tier green.
