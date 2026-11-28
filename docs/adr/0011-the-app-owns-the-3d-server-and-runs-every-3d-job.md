# The app owns the 3D server and runs every 3D job

Sessions hand 3D jobs to the app through a jobs folder, one request file per job, and the app runs each job itself as a worker process when its GPU turn comes. The app alone starts and stops the ComfyUI3D server and holds the coord board's `gpu` claim from server start to stop, because an idle server still keeps about 10 GB of model in VRAM. Before this, each session's gen3d.py started the server and stopped it when its own batch ended, killing another session's run. A session's gen3d.py only submits and waits; when the app isn't running it falls back to its old start, run, stop. A dead waiter can then never hold the GPU, and cancel is one place: interrupt ComfyUI and kill the worker. The jobs folder keeps the rule of ADR 0005, 0008 and 0009 that nothing talks to the app through a local server. A server started outside the app is used when no one else claims the GPU, but the app never stops it unless Andreas confirms.

## Considered Options

- A local HTTP API with a token file: faster replies, but it is the second channel into the app that ADR 0008 and 0009 turned down.
- The session runs the job and the app only grants GPU turns: less change to gen3d.py, but a session that dies mid-turn holds the GPU until a lease runs out, and cancel has to reach into another process.
