# 02: Last prompt strip

**What to build:** a one-line strip at the top of a chat that shows the last prompt Andreas sent there, while that prompt is scrolled out of view. Clicking it smooth-scrolls the chat to the prompt and briefly highlights it. Spec: `.scratch/ui-polish/spec.md` (user stories 6–13, "Last prompt strip").

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A new pure function, beside `currentTicket`, picks the last sent user prompt from a chat's items. It skips queued or held prompts and returns `{ id, text }` or nothing. Unit-tested like `currentTicket.test.ts`: last sent prompt, queued and held skipped, empty chat returns nothing, legacy repeated ids.
- [x] A new strip component sits in the chat's top area, next to `CurrentTicketStrip`, outside the scroll box. It reuses `ui/SummaryStrip` for its look. Its first line is cut to one line by CSS ellipsis, not by character count.
- [x] To know whether the prompt is on screen, an IntersectionObserver watches the `[data-item-id="<id>"]` element, with the transcript scroll box as root. The strip shows while that element is not intersecting. If the element isn't rendered yet, the prompt counts as out of view. There is no strip in a chat with no sent prompt.
- [x] A click calls `scrollIntoView({ behavior: 'smooth', block: 'start' })` on that element and adds a highlight class for about 1.5 s. While the click scroll runs, the follow-output logic must not pull the chat back to the bottom. Its existing "reader left the bottom" path should already handle this; verify it.
- [x] It must work with `content-visibility: auto` (`.lazy-render`). Scrolling to an element far up must land on it even though the items in between have estimated heights; scroll again once if the first landing is off.
- [x] The same component serves hosted chats (ChatView), observed chats (MessageList) and the chat drawer (the same Work chat, ADR 0004).
- [x] UI suite: add at most **one** new scenario (in `sessions.spec.ts` or `chat.spec.ts`, fake CLI). It sends prompts until the first prompt scrolls away, checks that the strip appears, clicks it, and checks that the prompt is in view. Check `pnpm e2e:count` stays at or under 20 (it is 12 before this flow).
