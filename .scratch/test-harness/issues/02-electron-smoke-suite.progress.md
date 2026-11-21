Round 2: review fixes: teardown snapshots the process tree and kills survivors (PID + start time), tighter assertions (effort high, setMode acceptEdits, polled log reads), guard test path escaped.
Three runs green: 20.1 s, 19.8 s, 26.3 s test time (25 s, 27 s, 32 s with the build); no leftover processes or temp dirs; quick tier green.
Resolved.
