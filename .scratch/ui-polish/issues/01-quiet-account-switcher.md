# 01: Quiet account switcher in the session header

**What to build:** the account pill in the session header ("Personal · Claude Ultra" with a usage bar, in a bordered box) becomes a quiet text dropdown, "Personal · Ultra ▾", with no border and no usage bar. Clicking it opens the same account switcher as today. Spec: `.scratch/ui-polish/spec.md` (user stories 1–5, "Account switcher look").

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `HostedAccountBadge` stops rendering usage meters and the bordered box. It shows the account text (short name · plan) and a ▾ chevron, in the header's muted text style, and turns brighter on hover.
- [ ] The click target and the `AccountSwitcher` popover stay unchanged. Picking an account still moves the whole workspace and restarts the chat after its turn.
- [ ] `ObservedAccountBadge` (VS Code chats) gets the same text look with no chevron and no click.
- [ ] `AccountMismatchNotice` is unchanged.
- [ ] The title bar usage strip and the Dashboard "Usage per account" panel are unchanged.
- [ ] Every existing UI-suite assertion that finds the badge or opens the switcher (e.g. `e2e/accounts.spec.ts`) still passes. Update its locators if it relied on the meters.
