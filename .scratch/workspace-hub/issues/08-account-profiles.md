# 08: Account profiles

**What to build:** Andreas can create named account profiles, log each in once, and assign one to each workspace. Hosted sessions run on their workspace's profile, and every profile shares his whole setup except the login. This is spec seam 3, the profile linker.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Profile store (id, name, config folder; Default = `~/.claude`)
- [ ] Creating a profile makes its folder under the app's data folder and links the shared items from Default: global CLAUDE.md, skills, plugins, settings, hooks, agents, commands, and memory plus transcripts (projects/). Directories as junctions, files as hard links (Windows file symlinks need Developer Mode, which is off). The login and account file are never linked.
- [ ] `ensureProfileLinks(profile)` runs before every session start and repairs broken or replaced links
- [ ] Logged-in is detected by the profile's credentials file existing; a profile without one shows "not logged in"
- [ ] Starting `claude` for a workspace sets `CLAUDE_CONFIG_DIR` to its profile folder; Default leaves it unset. A "Log in" action opens a normal shell tab with that variable set.
- [ ] A workspace's profile can be changed from its sidebar row
- [ ] The past-sessions list reads `<profile folder>/projects/<sanitised cwd>/`
- [ ] Tests against a temp Default folder and a temp profile folder: shared directories become junctions, shared files become hard links, the credentials and account files are never created or linked, and a replaced or deleted link is repaired on the next run
