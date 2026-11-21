# 04: Every account's usage at the top right, and the account switch in the header

**What to build:** the top-right strip shows every account profile, each labelled with its email and plan, with bars for the 5-hour session window and the weekly window. The numbers come from `get_usage` even when no chat runs on that account. Clicking an account opens an Account & usage popover like the extension's. The chat header gets an account dropdown that moves the workspace to another profile.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Usage service (main): per profile, a short-lived CLI process (non-default profiles with their `CLAUDE_CONFIG_DIR`, environment cleaned with `childEnv`) sends `initialize` then `get_usage` and exits — never a prompt; runs on app start, every 5 minutes, and after any session's turn `result` (debounced per profile); running sessions' `rate_limit_event`s update in between
- [ ] Per profile it keeps `{account: {email, organization, subscriptionType}, fiveHour?: {utilization, resetsAt}, sevenDay?: {utilization, resetsAt}, updatedAt, error?}`; windows that come back `null` are hidden; a profile without credentials shows "not logged in" with a Log in button (opens the login shell as Settings → Accounts does)
- [ ] Strip (top right): one entry per profile, label = account email (fallback profile name) + plan; two thin bars (5h, weekly) with tooltips "Session (5hr) 42% · resets in 2h 10m" / "Weekly (7 day) 69% · resets Mon 00:00"; the profile of the chat on screen highlighted
- [ ] Clicking an entry opens an Account & usage popover like the extension's: email, organization, plan, "Session (5hr)" and "Weekly (7 day)" bars with % and reset time, last updated, and "Refresh"
- [ ] The Dashboard's Usage per account section uses the same data
- [ ] Chat header account dropdown: lists profiles (not-logged-in disabled); choosing one sets the workspace's profile and restarts this chat with `--resume` on it (after the current turn if one runs); other chats in that workspace switch at their next start, said in a hint
- [ ] Tests (pure): `get_usage` reply → usage rows (null windows hidden, reset formatting), strip labels, the refresh schedule decision (start, 5 min, after result, debounce)
- [ ] Real-CLI check: the service returns your Default account's email/plan and weekly utilization without any prompt being sent
