# 10: Main chat pinned at the top of Work

**What to build:** one permanent session pinned above the Work list that answers general questions about every feature from the digest, on an account chosen in Settings, and cannot act. Spec: `.scratch/feature-cockpit/spec.md` (user stories 16, 19–21, 61, 64; "Main chat"). ADR 0008, ADR 0001.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] A main chat hosted session in a fixed app-owned folder, pinned above the Work list. It is resumed after a restart with its history, as one continuous conversation.
- [ ] Its account is chosen in Settings, the default account until chosen. Features on other accounts are read through files, never through their sessions or logins.
- [ ] Its first prompt names the digest's path and tells it that it answers only and may read the named features' spec, tickets and progress notes.
- [ ] The app starts it with additional directories for the digest's folder and every feature worktree, whatever their account (the existing add-dir arguments), so reading a feature needs no approval.
- [ ] The app starts it with a read-only tool allow-list, so "answers only" holds by construction: it can read but cannot write, run commands, or start, stop or complete a feature. If the CLI cannot restrict tools this way, stop and report the question.
- [ ] Vitest: the arguments the app builds for the main chat's process contain the read-only allow-list and no write or shell tool, and contain the digest folder and every feature worktree as additional directories; the account setting selects the profile's environment.
- [ ] No new UI suite scenario; the existing sessions path covers pinning.
