# 03: Thinking blocks, todo list, copy buttons, timestamps and scroll-follow

**What to build:** the chat renders the way the extension does. That means thinking blocks ("Thought for Ns", expandable), the TodoWrite checklist, copy buttons on code blocks and whole responses, and message timestamps. Scrolling stays where you are while you read and follows new output only at the bottom. Evidence is in `docs/research/vscode-extension-input.md` section 6.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Thinking content blocks render collapsed as "Thought for Ns" (wording per the extension), expandable to the text
- [ ] TodoWrite tool calls render as the extension's checklist (pending / in progress / done), updating as later TodoWrite calls arrive
- [ ] Copy buttons: on every code block and on each whole assistant response, as the extension places them
- [ ] Message timestamps as the extension shows them (placement/format per research doc)
- [ ] Scroll-follow: auto-scroll only when the view is at (or within a small threshold of) the bottom; a "jump to latest" affordance appears when new output arrives while scrolled up (if the extension has one, mimic it)
- [ ] Tests: pure scroll-follow rule, todo state merging, thinking duration; smoke scenario on the fake CLI with a script emitting thinking + TodoWrite
