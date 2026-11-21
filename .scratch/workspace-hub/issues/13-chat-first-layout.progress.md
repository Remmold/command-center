Done: chat full width by default; Ctrl+B / footer "IDE panels" toggles file tree+editor+git per workspace (persisted, store v8); bottom strip gone, shells open on demand in a collapsible drawer (Ctrl+` / footer "shell"); openShell(workspace, {kind, env}) in state/sessionNavigation.ts.
Next: Lane 2 look-and-feel check; ticket 08 wires ShellTab.env through Terminal -> pty:spawn -> ptyManager.spawn (spawn takes no env yet).
Open reds: none (pnpm build + pnpm quick 40/40 green, app boots clean).
