# 03: Follow file changes on disk and settle conflicts on Save

**What to build:** the page refreshes when Claude or anything else changes a file it shows, keeping pending changes, and Save asks which value to keep when the same key changed on disk. Spec: `.scratch/claude-settings/spec.md` (user stories 49, 50; "Settings file module" watching, "Renderer" changed event). ADR 0006.

**Blocked by:** 02

**Status:** resolved

- [x] The files of the layer and workspace on screen are watched (fs.watch with the polling backstop pattern used elsewhere). A change pushes a changed event with the new snapshot over the `claudeSettings:` domain.
- [x] An incoming changed event refreshes snapshots and keeps pending edits; a pending key whose disk value changed is marked so Save will ask.
- [x] On conflict the renderer asks per key (keep mine / keep the file's) and saves again with a new base. Nothing is written until every conflict is settled.
- [x] Watches end when the section closes or the layer or workspace changes.
- [x] UI suite: extend the `claudeSettings.spec.ts` scenario: write the file from outside and check the page shows the new value. No new scenario.
