# Terminals live in the main process; the Shell drawer and the Processes view attach to them

A terminal (a shell or a command the app runs for Andreas in a pty) belongs to one list kept by the main process, not to the Work view or project view that started it. The Shell drawer and the Processes view are both just windows onto that list. Either can show any terminal, and showing it in one place doesn't start a second process. Main keeps a capped tail of each terminal's output, so a view that attaches later (or after a remount) replays it and then follows live. Closing a view or a drawer never ends a terminal; only Close, the command exiting, or quitting the app does.

## Considered Options

- **Keep terminals owned by each project view's Shell drawer (as before)**: the Processes view would have to reach into every project view's state, and terminals would vanish whenever their project view was closed.
- **Separate terminals for the Processes view**: simpler, but the same dev server could not be watched from the drawer and the overall view, which is the point of the view.

This is the opposite of ADR 0004's choice for chats. A chat's process lives inside its component because rewriting the chat was too costly. A terminal is small enough to move its ownership out cleanly.
