# 01: Take over a VS Code chat

**What to build:** a **Take over** button on the read-only view of a chat listed under "In VS Code". It moves that chat into Command Center as a normal hosted chat by resuming it with its full history.

**Blocked by:** None. Build on main after release 0.1.2, which contains the observed-view fix.

**Status:** resolved

Decided by Andreas (2026-11-22): a button, not automatic. It hands over once VS Code's agent has finished its turn.

- [x] **Header button:** the observed session header gets **Take over**.
- [x] **Idle chat:** if VS Code's agent is idle or waiting for input, the chat switches at once.
- [x] **Working chat:** if the agent is working, the button turns into "Taking over when done…", with a way to cancel. The app watches the transcript and switches when the turn ends, meaning the last assistant message is complete and no tool call is pending. Use the same rules the app already uses for observed status and the past-sessions dots.
- [x] **Pending approval in VS Code:** it switches at once. The approval in VS Code is abandoned, and the user answers in Command Center.
- [x] **Switching:**
  - open a hosted chat in the same workspace with `--resume <sessionId>`, on the account set for that workspace;
  - put it in the half the observed view was using;
  - remove it from the "In VS Code" list (the observer keeps treating that session as taken over);
  - show a notification: "<title> is now in Command Center".
- [x] **Warning about VS Code:** after the switch, one notice line in the chat says the VS Code panel for this chat is now out of date, and that typing there would split the chat into two copies.
- [x] **Past conversations:** clicking a chat that is live in VS Code offers the same take-over (wait or now) instead of silently opening a second copy.
- [x] **Tests:**
  - the pure take-over decision (idle, working, waiting on input, cancelled);
  - an e2e on the fake CLI with a synthetic observed transcript:
    - an appended turn-end triggers the take-over;
    - the hosted chat starts with `--resume`;
    - the observed row disappears.
