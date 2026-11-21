# 01: VS Code Dark Modern theme across the app

**What to build:** the whole app takes VS Code's standard Dark Modern look. Colours come from one theme file of CSS variables, Tailwind maps semantic names onto them, and every component uses the semantic names instead of literal zinc colours. This goes first so later tickets aren't restyled twice.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [ ] One theme file defines CSS variables for the VS Code Dark Modern palette: editor background #1f1f1f, side bar #181818, title bar #181818, borders #2b2b2b, foreground #cccccc, muted #9d9d9d, accent #0078d4, focus border #0078d4, list hover #2a2d2e, list selection #37373d, input background #313131, plus diff inserted/removed backgrounds
- [ ] Tailwind's config maps semantic names (e.g. `bg-editor`, `bg-sidebar`, `border-subtle`, `text-fg`, `text-muted`, `accent`, `list-hover`, `list-selected`, `input`) onto those variables; the meter colours that copied hex values in tailwind.config.js use the theme too
- [ ] Fonts: "Segoe UI", system-ui at 13 px for text; "Cascadia Code", Consolas, monospace for code (chat code blocks, terminal, editor)
- [ ] Status colours are a separate semantic set chosen to stay distinct on that background: Needs approval and Your turn stand out from Running and Idle
- [ ] Every component under src/renderer uses the semantic names; no literal `zinc-*` colour classes remain (a check in the quick tier fails if any reappear)
- [ ] Monaco and xterm use their dark themes matching the palette
