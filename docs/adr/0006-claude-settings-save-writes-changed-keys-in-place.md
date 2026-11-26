# Claude Code settings saves only the changed keys, in place, onto the file as it is on disk

Claude Code writes its own settings files while the app is open (an "always allow" adds a permission rule, `/model` saves a model), so the Claude Code settings page is never the only writer. On Save the app re-reads the file, applies only the keys Andreas changed (a removed key is deleted, a changed one replaced), and writes the result back into the same file rather than through a temp file and rename. Anything else in the file, including keys the page doesn't know, stays as Claude left it. If Claude changed one of the keys Andreas edited since the page read it, Save asks which value to keep. Writing in place keeps the hard links that make app-made accounts share Personal's settings.json (see `src/main/profiles/linker.ts`).

## Considered Options

- **Write the whole form state back**: simplest, but it silently drops whatever Claude added while the page was open.
- **Temp file and rename, like the app's own data files**: atomic, but it replaces the linked file with a new one, so app-made accounts stop sharing Personal's settings.
- **Lock the file while the page is open**: Claude Code doesn't honour a lock, so it would only look safe.
