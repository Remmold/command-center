# A drift check reports through a findings file in the app's data folder

A drift check's session writes its findings as one JSON file per run in the app's own data folder, in a fixed schema. The Context map watches that file while the run is going and draws from it. The chat transcript is never parsed for results. A file with a schema is strict to read, can be followed live, and outlives the chat. It can also serve later checks (board cleanup, general cleanup), which only need a new prompt. Keeping the file out of the repos and account folders means an account-only run has somewhere to write, and no repo gets files it didn't ask for. The app writes only the run's skeleton, before the session starts. If that session then fails to start, or its chat is gone from the app before the run is done, the app removes the file while it is still a bare skeleton; a run with steps or findings whose chat is gone stays, shown as stopped. From then on Claude is the file's only writer, and fixes go back through the run's chat, so there is never more than one writer at a time, as with the board's ticket files (ADR 0002).

## Considered Options

- Parsing the chat's final findings table: fragile, and it can't be followed step by step.
- A markdown file in the workspace's `.scratch/`: readable by hand, but account-only runs have no repo, and it puts files in repos.
- A skill installed into each account: the app would write into account folders, and the skill would add to every chat's start total.
