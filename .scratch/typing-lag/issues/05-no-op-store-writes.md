# 05: Stores that did not change are not rewritten

**What to build:** a streamed event no longer rewrites the project views store when the Claude session id is unchanged (today 32 writes/s while streaming, 74/s in a tool-call turn, ~2 KB each). Spec: `.scratch/typing-lag/spec.md` (Implementation Decisions: project views store).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] The Claude session id is only set when it differs from the stored one (checked before calling the store), so a streamed event with an unchanged id writes nothing.
- [ ] Any other store found writing on an unchanged state on the per-event path gets the same guard.
- [ ] Tests, seam 3 (Vitest): noting an unchanged Claude session id writes nothing to storage; a changed one still saves.
