# processes-terminal progress

Base commit: 4dc2416 (feat/ui-polish), branch feat/processes-terminal
- 01 resolved: terminal registry in main (terminals:* IPC, 256 KB tail, restart, tree-kill close, running count); Shell drawer keeps ids and no longer ends terminals — a8a38de, review fixes 8b48019
- 05 resolved: quit confirm for running terminals on tray Quit, File > Exit and the update restart, one combined question with running sessions — 36cc92f, review fixes 56810de
- 02 resolved: Processes view on Ctrl+5 (all Claude processes and terminals by workspace, read-only/interactive xterm, Stop incl. new terminals:stop, ports) — 38f55ec, review fixes c93a783
- 03 resolved: New terminal (workspace + optional command, default shell), Rename, Restart, Close with confirm while running, Open in Shell drawer — e7927cf, review fixes ee78eeb
