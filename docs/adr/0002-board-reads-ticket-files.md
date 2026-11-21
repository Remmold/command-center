# The board is a read-only view of ticket files

The board reads each workspace's `.scratch/<feature>/` files and never writes them in v1. The agents doing the work edit those files. If the board also wrote them, two writers would race on the same markdown, and the files would stop being the one source of truth. Worktree copies of the same repo merge into one card per ticket, which shows the most advanced status found.
