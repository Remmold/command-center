# 06: Chats styled like the Claude Code extension

**What to build:** the chat reads like the Claude Code extension in VS Code: user prompts in a subtle bordered box, assistant text unboxed, tool calls as compact collapsible rows, and diffs in VS Code's diff colours. It applies to hosted and observed chats.

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] User prompts: a subtle bordered box (input background, border colour), full width of the message column
- [ ] Assistant text: unboxed, normal foreground, markdown rendered with VS Code-like headings, lists, inline code and code blocks (Cascadia Code / Consolas, editor background, syntax colours matching Dark Modern)
- [ ] Tool calls: one compact row each (tool name + short summary, e.g. "Read src/main/index.ts", "Bash pnpm quick"), collapsed by default, expanding to input and result; failed results marked
- [ ] Edit/Write diffs use VS Code's diff inserted/removed colours
- [ ] Turn footer, permission prompt and input box follow the same look; the input box resembles VS Code's (input background, focus border accent)
- [ ] The message column has a comfortable max width and centres in wide windows
