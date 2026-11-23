# 01: Approval inbox — answer every waiting prompt from one place

**What to build:** Andreas (2026-11-23): "a way to see the 'accept this' windows and just jump between them in all sessions. Get some context for each one and be able to just have it open and accept through different sessions."

Decided:
- an **overlay you can open from anywhere**;
- it collects **tool approvals, Claude's questions (AskUserQuestion) and plan approvals** from hosted chats; VS Code chats are not included;
- after answering, it **jumps to the next** and closes when the queue is empty.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Opening it:** Ctrl+Shift+A opens an overlay over any view. Check the shortcut map for clashes and for VS Code's meaning of the key. A count badge in the top bar ("3 approvals", hidden at 0) opens it too. Esc closes it. The Dashboard's Needs-you rows can open it at that item.
- [ ] **Queue, left or top:** one row per pending item across all hosted chats, oldest first. Each row shows the repo icon, chat title, account short name, kind (Bash, Edit, Write, MCP `Server [tool]`, Question, Plan) and age. J/K or ↑/↓ move between rows.
- [ ] **Selected item, main area. Context first:**
  - the last assistant text before the request, up to about 6 lines, expandable;
  - the chat's current todo item if there is one.

  Then the request, rendered exactly as the chat's own approval prompt renders it:
  - the command for Bash;
  - the diff for Edit/Write, reusing the chat's diff component;
  - the arguments for MCP;
  - the choices for a Question;
  - the plan text for a Plan.
- [ ] **Answering:** use the same answers, wording and keys as the chat's approval prompt (1 Yes / 2 Yes for this session / 3 No / "Tell Claude what to do instead"), questions with their options, and plans with their approve and keep-planning choices. Answer through the same code path the chat uses (the `can_use_tool` reply in the approval broker, and the AskUserQuestion and plan answers), never a copy, so a reply from the inbox and from the chat behave identically.
  - When something is answered in the chat itself, the inbox drops it at once, and vice versa.
  - After answering, move to the next oldest item. Close when nothing is left, with a short "All clear" toast.
- [ ] **Jumping:** **O** (or a button) opens the chat at that request and closes the overlay. The chat's own prompt keeps working as before.
- [ ] **Live:** items appear while the overlay is open, and are added to the end, never reordering under the cursor. If an item is answered or cancelled elsewhere (an interrupted turn, say), it shows "answered in chat" for a moment and then goes.
- [ ] **Notifications:** the existing Windows notification for a waiting chat gets the click action "open in approvals" when the reason is an approval.
- [ ] **Performance:** the overlay reads from the existing approval and chat stores, with no extra CLI requests. The perf guard gets one case: opening the overlay with 5 pending items takes under 100 ms.
- [ ] **Tests:**
  - pure: the queue model (order, live insert without reordering, removal when answered elsewhere, next-after-answer, empty, close);
  - **no new UI scenario** (budget ≤ 20, 18 used, runtime near 90 s). Extend one existing approval scenario: two chats waiting, open with Ctrl+Shift+A, answer the first with 1, check that it advanced to the second and that the fake CLI got the right reply, then answer and check it closes.
  - The zoom check opens the overlay at 150%.
