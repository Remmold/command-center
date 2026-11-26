# 09: Feature digest kept current

**What to build:** the app keeps one digest file listing every feature with its stage, tickets done, session status, account, test result and server state, rewritten on every change, with no tokens spent. Spec: `.scratch/feature-cockpit/spec.md` (user stories 17, 18, 47, 57, 61–63; "Feature digest writer").

**Blocked by:** 02, 04, 05

**Status:** resolved

- [x] A pure digest writer renders every feature record into one markdown file in the app's data folder: name, workspace, stage, tickets done out of total, session status, the account's name, the last test result (ticket 05), the servers' state (ticket 04), and whether the account is rate limited, taken from the usage service the Dashboard already uses.
- [x] The file is rewritten on a change of any of those facts, never on a timer, and writes only when its text differs.
- [x] Writing the digest starts no Claude process and spends no tokens.
- [x] The digest lists features of every account, with the account's name on each line.
- [x] Vitest: the rendering for each stage, a rate-limited account, a failed test result, a feature with servers failed; no write when nothing changed.
