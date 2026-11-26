# 03: A workspace's preview config, edited in Settings

**What to build:** a workspace can have a saved preview config (an install command, one or more servers with a ready check, a start page) that New feature uses for the install step, and a workspace without one is plainly marked as having no browser. Spec: `.scratch/feature-cockpit/spec.md` (user stories 4, 37, 39, 40; "Preview config").

**Blocked by:** 01

**Status:** resolved

- [x] A preview config store per workspace: optional install command; a list of servers, each with a name, command, working folder inside the worktree, ready check and optional `{port}` placeholder in the command; and a start page path. A server's ready check is "the port accepts a connection".
- [x] A pure reader validates a config and substitutes `{port}`; an invalid config is refused with a reason that names the field.
- [x] Settings gets a place to edit it per workspace (install command, servers, start page) with Save and Discard, and says "no browser, only the test flow" for a workspace with none. Several servers (a front end and an API) can be listed.
- [x] New feature runs the workspace's install command in the new worktree before starting the feature session; a failing install is a failure step of ticket 01 (clean-up, reason shown).
- [x] A workspace without a preview config behaves exactly as in ticket 01.
- [x] Vitest: reading, validation, placeholder substitution, several servers, a missing field named in the refusal.
- [x] No new UI suite scenario.
