# 05: "3 No" feedback reaches Claude as the user's own words

**What to build:** when Andreas chooses **3 No** and types what to do instead, Claude follows that text. The prompt looks the same as the extension's; only the message sent back to Claude changes. This is the only deliberate difference from the extension: with its exact rejection text, Claude sometimes treated the feedback as suspected prompt injection and retried the command.

**Blocked by:** 02

**Status:** resolved

- [x] The deny reply's `message` states plainly that the user rejected the tool call and typed the instruction themselves, then quotes the typed text, e.g. `The user denied this tool call and typed this instruction for you to follow instead: "<text>"`. No feedback text → the extension's default rejection message, unchanged.
- [x] Nothing changes in how the prompt looks (buttons, wording, keys).
- [x] Tests (pure): the deny payload with and without feedback; feedback with quotes and newlines is passed through intact.
- [x] Real-CLI check (Haiku, one-line prompt, at most 2 prompts; `--setting-sources project,local` so the user's allow rules don't apply; never copy credentials): a denied Write with the feedback "write it to b.txt instead" leads Claude to write b.txt.
