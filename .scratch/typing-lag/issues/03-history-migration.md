# 03: Existing saved history moves over once

**What to build:** on the first start of the new version, the history saved in the old browser-storage entry is moved into the per-session files and the old entry is removed, so no chat opens empty. Spec: `.scratch/typing-lag/spec.md` (Implementation Decisions: migration, once).

**Blocked by:** 02

**Status:** resolved

- [x] On start, when the legacy `command-center.chat-items` localStorage entry exists, its sessions are imported into the new files (import wins only for sessions with no file yet), and the entry is removed after the import succeeds. A failed import leaves the entry in place for the next start.
- [x] Migrated chats show their history from the first frame of that first start.
- [x] Tests, seam 1: legacy import fills only sessions without a file.
- [x] Tests, seam 2: migration imports the legacy entry and removes it only after the import resolves; a failed import keeps it.
- [x] Check once on a realistic size (~20 MB entry, as ticket 01 seeds) that the first start opens with the history shown and the entry is gone afterwards.

## Comments

- 2026-11-25: an entry that cannot be parsed as chat history is now deleted instead of retried every start (~150 ms each); a failed write still keeps it for the next start. Spec's "Migration, once" updated.
