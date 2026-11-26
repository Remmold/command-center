# UI polish: quiet account switcher, last prompt strip, freer sidebar

**Status:** ready-for-agent

## Problem Statement

Three things in Work get in Andreas's way:

- The account pill in the session header ("Personal · Claude Ultra" with a usage bar, in a bordered box) looks off-putting. The same usage bars already show in the title bar strip and on the Dashboard, so the header's copy only adds noise.
- In a long chat it's hard to get back to what he last asked. The last prompt scrolls away under Claude's reply and he has to hunt for it.
- The Work list is too rigid. Ungrouped is always first in an account and can't be moved, and a session can only go into own groups of its own account. Andreas wants to sort sessions by what they're about, across accounts, without that changing which account a session runs on.

## Solution

- The account pill becomes a quiet text dropdown, "Personal · Ultra ▾", with no border and no usage bar. A click opens the same account switcher as today.
- A **last prompt strip** shows at the top of a chat whenever the last prompt Andreas sent there is scrolled out of view. Clicking it scrolls the chat back to that prompt and briefly highlights it.
- Ungrouped can be dragged like an own group. By default it sits last in the account, and existing layouts move it there once. Sessions can be dragged, or moved with the "Move to group" menu, into an own group or Ungrouped under any account. Such a **guest session** keeps its own account and its row carries a tag naming that account.

## User Stories

1. As Andreas, I want the session header to show the account as plain text with a small ▾, so that the header looks calm.
2. As Andreas, I want the header to show no usage bar, so that usage appears only in the title bar strip and on the Dashboard.
3. As Andreas, I want clicking the account text to open the same account switcher as today, so that I can still move a workspace to another account from the chat.
4. As Andreas, I want the account mismatch notice ("Running on X; this workspace is set to Y") to keep working as it does today, so that a chat restarted on another account is still explained.
5. As Andreas, I want VS Code chats to show their account as the same quiet text, without the ▾ and not clickable, so that both kinds of chat look alike.
6. As Andreas, I want a one-line strip at the top of the chat with my last sent prompt once it has scrolled out of view, so that I always know what I last asked.
7. As Andreas, I want the strip to hide while that prompt is on screen, so that it never repeats what I can already see.
8. As Andreas, I want clicking the strip to smooth-scroll the chat to that prompt and briefly highlight it, so that I land on it at once.
9. As Andreas, I want the strip to show my last sent prompt, not one still queued or held, so that it matches what Claude is working on.
10. As Andreas, I want long or multi-line prompts cut to one line with an ellipsis, so that the strip stays one line tall.
11. As Andreas, I want the strip in hosted chats, VS Code chats and the chat drawer, so that it works wherever I read a chat.
12. As Andreas, I want no strip in a chat where I haven't sent anything yet, so that empty chats stay clean.
13. As Andreas, I want the strip to sit with the current ticket strip without covering the transcript, so that both stay readable.
14. As Andreas, I want to drag Ungrouped up or down among my own groups, so that I can put it where it suits me.
15. As Andreas, I want Ungrouped to sit last in an account by default, existing accounts included, so that my own groups come first.
16. As Andreas, I want Ungrouped's position kept per account across restarts, so that it stays where I put it.
17. As Andreas, I want a new session to land at the top of Ungrouped wherever Ungrouped sits, and the list to scroll it into view, so that I see it at once.
18. As Andreas, I want to drag a session into an own group or Ungrouped under another account, so that I can sort sessions by topic across accounts.
19. As Andreas, I want the "Move to group" menu to list the groups of every account, under each account's name, so that I can move a session there without dragging.
20. As Andreas, I want Alt+arrow and Alt+Shift+arrow moves to stay within the account section the session sits in, so that keyboard moves stay predictable.
21. As Andreas, I want a guest session to keep running on its own account (its workspace's), so that moving it never switches its login or restarts it.
22. As Andreas, I want a guest session's row to carry a small tag naming the account it runs on, so that I'm never misled by the section it sits in.
23. As Andreas, I want the tag gone once a session sits under its own account again, whether I move it back or its workspace switches to that account, so that tags only show where they mean something.
24. As Andreas, I want a guest session that closes and resumes, or is taken over, to come back to its guest spot, so that resuming doesn't undo my sorting.
25. As Andreas, I want a session to appear in exactly one place in the list, so that guest sessions are never shown twice.
26. As Andreas, I want account section headers and their usage to stay as they are, so that the list keeps its shape.
27. As Andreas, I want the Dashboard, Board, approval inbox and title bar strip to keep counting a guest session under its own account, so that per-account numbers stay true.

## Implementation Decisions

**Account switcher look**
- `HostedAccountBadge` stops rendering usage meters and the bordered box. It shows the account text (short name · plan) and a ▾ chevron, in the header's muted text style, and turns brighter on hover. The click target and `AccountSwitcher` popover stay unchanged.
- `ObservedAccountBadge` gets the same text look with no chevron and no click.
- `AccountMismatchNotice` is unchanged.

**Last prompt strip**
- A new pure function, beside `currentTicket`, picks the last sent user prompt from a chat's items. It skips queued or held prompts and returns `{ id, text }` or nothing. Its first line is cut to one line by CSS ellipsis, not by character count.
- A new strip component sits in the chat's top area, next to `CurrentTicketStrip`, outside the scroll box. It reuses `ui/SummaryStrip` for its look.
- To know whether the prompt is on screen, an IntersectionObserver watches the `[data-item-id="<id>"]` element, with the transcript scroll box as root. The strip shows while that element is not intersecting. If the element isn't rendered yet, the prompt counts as out of view.
- A click calls `scrollIntoView({ behavior: 'smooth', block: 'start' })` on that element and adds a highlight class for about 1.5 s. While the click scroll runs, the follow-output logic must not pull the chat back to the bottom. Its existing "reader left the bottom" path should already handle this; verify it.
- It must work with `content-visibility: auto` (`.lazy-render`). Scrolling to an element far up must land on it even though the items in between have estimated heights; scroll again once if the first landing is off.
- The same component serves hosted chats (ChatView), observed chats (MessageList) and the chat drawer (which shows the same Work chat, ADR 0004).

**Sidebar layout**
- `AccountLayout` gains Ungrouped's position among the own groups, as an index into the group order: `ungroupedAt: number`. A missing value means last. On load, layouts without it get it set to last, once. This is how existing layouts move Ungrouped to the bottom.
- `listsOf` / `accountSections` place Ungrouped at `ungroupedAt` instead of first. Ungrouped is still hidden when empty.
- `moveGroup` can move Ungrouped (its id is `UNGROUPED`), within its own account only. `GroupSection` arms dragging for Ungrouped too. The rule "dropping a group on the Ungrouped header puts it first, never above Ungrouped" is dropped; the drop goes where it lands, as for any group.
- New chats still go to the top of Ungrouped. When one is added, the list scrolls that row into view.
- **Cross-account placement:** `moveChat` moves a chat id from wherever it is placed (any account's lists) into a target group of any account. The layout becomes the single source of truth: an id sits in at most one list across all accounts. `placeChats` / `placeAccount` treat an id placed under any account as placed, so they don't add it again as unplaced under its own account. The 30-day prune and the "known/seen" bookkeeping must work on guest ids too.
- Drop targets accept a chat from any account (the `d.group === profileId` check is dropped for chats). Groups still only move within their own account.
- The "Move to group" menu lists the own groups and Ungrouped of every account, under each account's name. The current account comes first.
- `moveChatStep` and `moveChatToNextGroup` stay inside the account section the chat sits in. For a guest, that is the host account's section.
- A row is a guest when the section's account differs from the row's account (`accountOf(row.workspace.profileId)`). The row then shows a small tag with that account's short name in its account colour. Nothing about the session's process, its account or its workspace changes when it moves.
- Every per-account count (Dashboard, title bar strip ring, Board, approval inbox, tray) keeps using the workspace's account, not the sidebar section.

## Testing Decisions

Good tests check behaviour through the highest seam: given a layout and an action, what list comes out. They don't assert private helpers or DOM structure.

Seams (no new seams; all exist):
1. **The sidebar layout's pure functions** (shared sidebarGroups, tested in `sidebarGroups.test.ts`), plus **`accountSections`** (`sessionList.test.ts`). These cover: Ungrouped's position defaults to last and is migrated once; moving Ungrouped; guest moves both ways; one place per id across accounts; placement doesn't duplicate guests; prune and resume keep guest spots; keyboard moves stay in their section; guest detection.
2. **The last-prompt picker** (pure, beside `currentTicket`, prior art `currentTicket.test.ts`). It returns the last sent prompt, skips queued and held prompts, returns nothing for an empty chat, and handles legacy repeated ids.
3. **The UI suite** (`e2e/`, currently 12 of 20 scenarios). Add at most **one** new scenario, in `sessions.spec.ts` or `chat.spec.ts`, that sends prompts on the fake CLI until the first prompt scrolls away, checks that the strip appears, clicks it, and checks that the prompt is in view. Drag-and-drop across accounts is covered by seam 1; extend an existing sidebar scenario only if it is cheap. The header's look is Lane 2 (Andreas judges it).

## Out of Scope

- Changing which account a workspace or session uses as a side effect of moving it in the list.
- Moving own groups between accounts.
- Removing account sections from the Work list.
- The title bar usage strip and the Dashboard usage panel (unchanged).
- Processes (its own flow, `processes-terminal`).
- Pinning more than the last prompt, or a list of earlier prompts.

## Further Notes

- The glossary gained **Guest session** and **Last prompt strip**, and **Own group** was updated: Ungrouped is last by default, and groups may hold guest sessions.
- ADR 0004: the last prompt strip lives inside the chat component, so the chat drawer gets it for free. No second chat is mounted.
