# 02: Dashboard · Work · Board views and the Settings page

**What to build:** three top-level views switched in the title bar and with Ctrl+1 / Ctrl+2 / Ctrl+3, opening on the Dashboard, plus a Settings page behind a gear (Ctrl+,) that takes over workspace management, accounts, apps, scan roots and Start with Windows. The Dashboard and Work views can be placeholders here: ticket 03 fills Work and ticket 05 fills Dashboard. Until 03 lands, Work shows today's sessions layout.

**Blocked by:** 01

**Status:** resolved

- [x] `view` becomes `'dashboard' | 'work' | 'board'`, defaulting to `'dashboard'`. Ctrl+1/2/3 select them. The persisted old value `'sessions'` migrates to `'work'`.
- [x] The tray menu offers Dashboard, Work and Board (replacing Sessions and Board). A notification click opens Work on that session.
- [x] Settings is a separate overlay page, not a view, opened by a gear in the title bar and Ctrl+,; Esc closes it. Sections: Workspaces, Accounts, Apps, Board, General.
- [x] Workspaces lists every workspace grouped by repo, with its account profile picker, the repo icon editor, and Remove, plus "Add workspace"
- [x] Accounts creates and renames profiles and logs them in
- [x] Apps holds today's apps dashboard (start/stop local apps)
- [x] Board holds the scan roots and the not-added repos with their Add buttons; the Board's slim "N repos aren't added · Review" line links to Settings → Board
- [x] General holds Start with Windows, with the same enabled/disabled rules as the tray checkbox
- [x] Shortcuts don't clash: Ctrl+1/2/3 views, Ctrl+, settings, Alt+1..9, Ctrl+J, Ctrl+B, Ctrl+\`
