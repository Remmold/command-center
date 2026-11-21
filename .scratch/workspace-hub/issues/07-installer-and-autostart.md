# 07: Per-user installer and Start with Windows

**What to build:** a per-user Windows installer (no admin), and a working Start with Windows option that launches the installed app hidden in the tray at login.

**Blocked by:** 06

**Status:** resolved

- [x] electron-builder, NSIS, per-user install, no admin; the tray icon and app icon live in the build resources; a `dist` script builds the installer
- [x] Start with Windows uses Electron's login-item setting with a "hidden" argument, so the app starts in the tray; the checkbox reflects the real login-item state
- [x] Autostart is only offered in the installed build; in dev the checkbox is disabled and says why
- [x] The installer builds locally and the native terminal module is packed for Electron
