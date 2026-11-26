# 07: Set up preview: Claude drafts the preview config

**What to build:** a workspace with no preview config offers Set up preview, which has Claude draft one from the project for Andreas to confirm. Spec: `.scratch/feature-cockpit/spec.md` (user story 38).

**Blocked by:** 03

**Status:** in-progress — built and tested; the three behaviours not yet seen in a running app

- [ ] A Set up preview action on a workspace without a preview config starts a hosted session in that workspace on its account, asking Claude to read the project (package manifest, scripts) and propose the install command, servers and start page in the preview config's shape.
- [ ] The proposal arrives in the Settings editor of ticket 03 as an unsaved draft; nothing is saved until Andreas confirms with Save.
- [ ] A project that has nothing to serve (a game, a native app) gets a plain "no browser needed" outcome, not an invented config.
- [x] Vitest: the prompt builder and the draft parser accept a valid draft and refuse an invalid one with a reason. No real Claude in tests.
