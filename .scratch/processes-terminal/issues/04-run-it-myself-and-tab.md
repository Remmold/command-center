# 04: Run it myself; the Processes tab gets the terminal look

**What to build:** a Claude background process gets **Run it myself**, which stops Claude's copy and reruns the same command, in the same workspace folder, as Andreas's own terminal. The per-session Processes tab shows output in the same read-only terminal look, with "Open in Processes". Spec: `.scratch/processes-terminal/spec.md` (user stories 10–12, 27–29, "Run it myself", "Processes tab (per session)").

**Blocked by:** 02

**Status:** in-progress

- [ ] Run it myself is offered for running or ended Claude background processes of hosted sessions. The confirm reads: "Stop Claude's copy and run `<command>` yourself in `<workspace>`? Claude won't see its output any more."
- [ ] On OK it calls the existing `stop_task` (skipped if already ended), then creates a terminal with that command, the session's workspace folder as cwd, the default shell kind, and the label = the command. Then it selects it. Nothing is sent to the chat.
- [ ] Processes tab: each process's output uses the same read-only xterm panel instead of `TerminalOutput`. It keeps the existing 1 s polling while on screen.
- [ ] An "Open in Processes" link switches to the view with that process selected.
- [ ] Claude's background processes keep today's rules (listed until their session closes, ended with it). The Work session list's process badge is unchanged.
- [ ] Output delta: when the new output no longer starts with what was written (a cut, `truncated` output), append only the part past where it overlaps the end of what was written; clear and rewrite only when there is no overlap. Unit-tested at the taskOutput seam. (Added by the conductor.)
- [ ] UI suite: add scenario (b), on the fake CLI, or extend `processes.spec.ts` if cheaper. A Claude background server shows in the Processes view with live output and its port, and Run it myself stops it and leaves a running terminal of mine with the same command. Keep `pnpm e2e:count` at 15 of 20 or fewer.
