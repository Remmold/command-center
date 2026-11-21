# Overnight decisions log

Each entry records what was decided, why, and the alternative. Review these in the morning.

1. **Effort is saved as `modelSettings.<model id>.effortLevel` in `settings.json`**, not a top-level `effortLevel`.
   - Why: that's where the CLI and the extension keep it. The CLI ignores a top-level key at startup, and "Max" is never saved.
   - Alternative: the top-level key the ticket named, which would have no effect.
2. **The app writes `settings.json` itself, in place**, rather than asking the CLI to save it.
   - Why: the CLI replaces the file when it saves, which breaks the hard link that shares it with your other account profiles.
   - Alternative: use the CLI's `update_settings` and lose that sharing.
3. **Thinking on/off is stored per chat, with a toggle in the prompt footer.**
   - Why: the extension keeps it in VS Code's own storage and puts it in its `/` menu. Neither exists here, so the ticket's footer toggle stays.
   - Alternative: an app-wide setting.
4. **The model pill reads "Opus 5.5 High"**, effort muted and no separator, exactly like the extension. Work list rows read "Opus 5.5 · High".
5. **Test credentials are never copied any more.**
   - Why: ticket 03 copied your `.credentials.json` into a temp home, and a token refresh there can rotate your real login. A no-prompt probe confirmed your real login still works.
   - Instead: permission tests that must avoid your allow rules use `--setting-sources project,local`. Everything else uses the fake CLI.
6. **The "new X session here" menu items no longer change the default model.**
   - Why: the default now lives in `settings.json`, as in the extension.
