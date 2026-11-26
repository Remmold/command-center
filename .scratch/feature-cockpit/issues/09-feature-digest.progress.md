Done: digest renderer, change-only debounced writer, wiring in ipc.ts; self-review fixed one misleading comment.
Checks: pnpm quick, build, pnpm e2e (17 of 20) green.
Not seen live: the file written by a running app; a limit that expires with no new usage reading stays listed until the next usage event.
