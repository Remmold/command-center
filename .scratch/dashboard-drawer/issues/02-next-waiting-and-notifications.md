# 02: Ctrl+Shift+J and notifications use the chat drawer on the Dashboard

**What to build:** while the Dashboard shows, Ctrl+Shift+J works down the waiting sessions inside the chat drawer, and clicking a "needs you" notification opens its session in the drawer instead of throwing Andreas into Work (spec: `.scratch/dashboard-drawer/spec.md`). A session read in the drawer counts as on screen. Everything outside the Dashboard is unchanged.

Rules (from the spec, word for word):
- **Ctrl+Shift+J on the Dashboard** picks the next waiting session after the drawer's session, in the order the Work list shows waiting sessions (the existing next-waiting rule, with the drawer's session in place of the session on screen in Work). With the drawer closed it opens the first waiting one. With none waiting it does nothing. In every other view the shortcut is unchanged.
- **Notification clicks** (toast and tray, the main process's open-session request) open in the drawer while the Dashboard is the current view and Settings is closed. Otherwise they open in Work as today.
- **Which chat "is on screen":** the existing "pane on screen" notion (used for unread/attention logic) also counts the drawer's session while the Dashboard shows, so a session being read in the drawer is treated as seen just as it would be in Work.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Unit tests (seam 1): next-waiting selection with the drawer open (the one after the drawer's session), closed (the first waiting one) and with nothing waiting (nothing happens, the view stays the Dashboard); the shortcut outside the Dashboard unchanged; notification routing by current view (Dashboard → drawer, Dashboard with Settings open → Work, any other view → Work); the drawer's session counts as on screen only while the Dashboard shows.
- [ ] Extend ticket 01's dashboard UI scenario (no new scenario; the suite stays at 13 of 20): Ctrl+Shift+J swaps the drawer to the second waiting session; Board and back keeps the drawer on that session. It must stay within 200 s.
- [ ] Quick tier green.
