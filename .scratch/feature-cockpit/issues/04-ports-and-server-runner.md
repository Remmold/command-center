# 04: Reserve free ports and boot a feature's servers

**What to build:** a feature's servers boot from its preview config in its worktree on free ports the app reserves, show Starting, Ready or Failed, and can be retried or stopped. Spec: `.scratch/feature-cockpit/spec.md` (user stories 23–27, 40, 62; "Port allocator", "Server runner").

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] A pure port allocator picks from the reserved range 4100–4999, skipping ports in the app's own feature records and ports that accept a connection or fail to bind right now. A feature keeps its ports until Complete, also across restarts of its servers. Exhausting the range is refused with a plain reason.
- [ ] Each server starts in the feature's worktree as a terminal the app already knows, so its output and Stop show in the Processes view. It gets the port as `PORT` and wherever the command says `{port}`. It runs on the feature's account environment.
- [ ] The runner waits for the ready check for up to 60 seconds, and reports Starting, Ready or Failed per server. A failed or timed-out server shows its output and a Retry.
- [ ] The feature row shows the servers' state (all Ready, Starting, Failed) and has Start servers and Stop servers actions. Stopping frees no ports; the feature keeps them.
- [ ] Two features, of one project or of two, never get the same port, even when started at once.
- [ ] Vitest: allocator (range, skip taken, skip bound, keep stable, exhausted), runner states with a fake server (ready, never ready at 60 seconds with a short test timeout, fails at start), command template, environment names the feature's profile.
- [ ] No new UI suite scenario.
