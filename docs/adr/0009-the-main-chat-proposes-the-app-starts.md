# The main chat proposes a feature; the app starts it

The main chat can plan a feature with Andreas and propose it, but it never starts one. It writes a proposal block in its reply; the app turns that into a card in the chat, and the app starts the feature only when Andreas presses Go on the card. The chat's process keeps read tools only and gains no tool, no MCP server and no write access. This keeps ADR 0008's rule that the main chat is read-only by construction: a proposal is text, and text cannot act.

The consequences that follow from that:

- Go is a click on the newest card, never a typed word, so the model cannot fake or misread consent. A newer card, or any message after a card, makes older cards read-only.
- The starting brief is written by the app (the chat cannot write) into the new worktree's `.scratch` folder, inside the same step that makes the worktree, so a failed write undoes the feature.
- The app reports the outcome by telling the chat in one short message, so the chat can confirm in words and knows about a failure before it proposes again.

## Considered Options

- **A start-feature tool the chat calls (local MCP server, approval-gated)**: returns exact results to the model, but it is the second channel ADR 0008 rejected, it needs a local server and a token, and consent lives in an approval the model triggers instead of a card the model cannot press.
- **Typed "go"**: natural, but the app would have to match free text to a proposal; "go on, change the name" misfires.
- **The chat writes the brief itself (give it Write inside `.scratch`)**: no app step, but it widens the write surface of a chat meant to answer, and a worktree that does not exist yet cannot be written to.
