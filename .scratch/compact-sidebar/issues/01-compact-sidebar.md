# 01: A compact Work sidebar

**What to build:** Andreas (2026-11-23): "sidebar has too much data". His 0.1.9 screenshot is `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\scratchpad\parity-shots\sidebar-too-much.png`; read it first. Each account shows 3–5 lines of usage text, and every account repeats status headings (IDLE, IN VS CODE…).

He chose the **Compact** layout, and **"Personal"** as the short name for the default account:

```
⌄ ● Personal · Ultra      █████████░ 96%
   Blender MCP for Synty       ●
   New session                 ●
   Repository overview         ●
   Command center kanban   [vsc]●
⌄ ● Work · Team          ██░░░░░░░░ 23%
   /flow Kundkrav feature  [vsc]●
   PR #1213                [vsc]●
   …
```

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Account header: exactly one line.**
  - The account's colour dot, its short name and plan, then a thin weekly usage bar with the percentage, right-aligned.
  - The bar and percentage take the pace colour: neutral when on track, amber when ahead of pace, red at 90% or more of the limit.
  - When the 5-hour window is the binding one (5-hour usage % higher than weekly %), show the 5-hour figure instead, with a tiny "5h" prefix.
  - Hover gives a tooltip with both windows, each with its pace verdict and reset time.
  - Folding still works. The amber "N waiting" pill appears only when folded.
- [x] **No status headings.** The Needs you / Running / Idle / In VS Code sub-headings go. Rows inside an account sort by: needs you, then running, then idle, then In VS Code; newest first within each.
  - Each row's status dot carries the status as today. Needs-you rows get a subtle amber left edge.
  - A small VS Code glyph marks chats that live in VS Code, before the dot, with the tooltip "In VS Code — read-only; Take over to continue here".
  - With a single account there's no account header; rows sort the same way.
- [x] **Account short name:** the default account shows "**Personal**" instead of its email. The full email appears in the header tooltip and in Settings.
  - Accounts get an editable display name in Settings → Accounts, defaulting to "Personal" for the default and the profile name for the others ("Work").
  - The same short name is used on the chat header badge, the top-right pills and the Dashboard tags.
- [x] **Rows:** keep the narrow rules: title first, with model and effort hidden when narrow. Row height and font stay the same; the change only removes lines.
- [x] **Keyboard:** Ctrl+Shift+J and Alt+1..9 follow the new visual order.
- [x] **Tests:**
  - pure: the row sort order, the header usage choice (weekly vs binding 5-hour) with its colour thresholds, and the default display name;
  - update the existing UI assertions (grouped-by-account and two-account scenarios in `e2e/accounts.spec.ts`) to the new layout, with no new scenario;
  - the zoom check's narrow-list case: the header's percentage is never truncated at 300 px and 150%.
  - The perf guard stays green.
