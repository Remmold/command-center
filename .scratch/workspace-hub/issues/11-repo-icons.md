# 11: Repo icons everywhere

**What to build:** Andreas can give each repo group an icon: a built-in icon plus accent colour, or his own PNG/SVG. It marks that repo on sidebar rows, session tabs, the Needs you queue, board cards and feature headers, and in Windows notifications.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] A repo group's identity: display name, plus an icon that is one of a built-in icon name with accent colour, a custom image copied into the app's data folder, or unset. Unset renders the first letter of the name on a colour hashed from the repo group key.
- [ ] Identities are stored by repo group key next to the workspace store and edited from the repo group's row in the sidebar
- [ ] The icon shows on sidebar rows, session tabs, the Needs you queue, board cards and feature headers; worktrees show their tag beside it
- [ ] Notifications use the repo icon rendered to an image
