# The chat drawer borrows Work's chat instead of mounting its own

A hosted chat owns its Claude process: it starts the process when it mounts, and every chat stays mounted inside Work, hidden while another view shows. The Dashboard's chat drawer therefore does not render a chat of its own. While the Dashboard shows a session in the drawer, that session's one mounted chat is positioned over the drawer's area and kept visible, while the rest of Work stays invisible. A chat can be on screen in only one place at a time, which holds because Work is hidden whenever the Dashboard shows.

## Considered Options

- **Move process ownership out of the chat into a store**: any view could then mount a chat freely (pop-outs, several drawers), but it means rewriting the largest component that everything depends on, for a feature that needs one chat in one place.
- **Mount a second chat in the drawer**: two components would start, stream into and stop the same process.
