# Progress

- 01 resolved: typing perf check committed red (tool-call turn p90 477 ms, worst 671 ms) — c78e5e6
- 05 resolved: unchanged Claude session id (and permission mode) no longer rewrites the project views store — 41fc1b8
- 02 resolved: chat history in one file per session saved by main; typing check green (tool-call p90 6 ms, worst 7 ms) — 9e75089
- 03 resolved: legacy localStorage history moved into the files once on first start (22.8 MB entry: +~140 ms that start) — bb54038
- 04 resolved: streamed deltas applied once per frame, prompt box memoised, chat item passes stable during deltas; typing check streaming 5/7/13/0 (was 4/6/34/0) — fb1c04c
