# 01: Workspaces follow the account VS Code uses for them

**What to build:** Andreas expected his work repos to use his work license in Command Center automatically, as they do in VS Code. Command Center had only the default account, and every workspace ran on it.

VS Code ties folders to profiles in `%APPDATA%\Code\User\globalStorage\storage.json` → `profileAssociations.workspaces`, which maps a folder URI to a profile location id; names come from `userDataProfiles`. Each profile's `claudeCode.environmentVariables` → `CLAUDE_CONFIG_DIR` is its Claude account. On his machine the **Work** profile uses `C:\Users\remmold\.claude-work` and is tied to `c:\projects\work\continuum`, `c:\projects\work\nordkastell`, `continuum-polish`, `hero-world` and `personal\mmo-launcher`. Command Center has continuum and nordkastell.

Decided by Andreas (2026-11-23): build automatic matching. He will not set it up by hand first.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Read-only reader:** a pure reader of VS Code's folder→profile associations, combined with the existing profile reader (`src/main/profiles/vscodeProfiles.ts`). It answers "which Claude config folder does VS Code use for this folder?". Folder URIs are `file:///c%3A/...`: decode them and compare paths case-insensitively with trailing slashes removed, as `samePath` does. A folder inside an associated folder doesn't inherit; only exact matches count, as in VS Code. The `__default__profile__` folders map to the default profile's `CLAUDE_CONFIG_DIR` when that profile sets one, else to `~/.claude`.
- [x] **Suggestion banner:** when VS Code ties one or more of the app's workspaces to a Claude folder that the app doesn't use for them, Settings → Accounts and Settings → Workspaces show one banner. It says: "VS Code uses the **Work** account for continuum and nordkastell." It has a **Use the same accounts** button and a Dismiss button. Dismiss is remembered per suggestion, so a new mismatch shows again.
- [x] **Use the same accounts:**
  - adopt each needed folder as an account the way **Use existing folder** does today, without touching the folder, named after the VS Code profile ("Work");
  - set each matching workspace to that account;
  - leave open chats on their current account and say so in one line: "Chats already open keep their account; new chats and resumed ones use Work."
- [x] **New workspaces:** adding a workspace whose folder VS Code ties to a profile preselects that profile's account in the add flow. The user can still change it.
- [x] **Startup notice:** on first start after this update, if a suggestion exists, the Dashboard shows a small dismissible notice linking to the banner. That's how Andreas finds it without opening Settings.
- [x] **Safety:**
  - read VS Code files only;
  - never write to them, to `.claude-work` or to `~/.claude`;
  - a missing or broken `storage.json` means no suggestion, not an error.
- [x] **Tests:**
  - the pure association reader: URI decoding, case, default profile, missing files and broken JSON;
  - the suggestion model: mismatches found, dismissed suggestions remembered, a new mismatch showing again;
  - an e2e with a temp fake VS Code folder (the harness already points the app at one through `vscodeUserDir`), holding a Work profile and an association. The banner shows; one click adopts the folder and moves the workspace; a new chat there starts with that `CLAUDE_CONFIG_DIR` (check the fake CLI's logged env).
  - The perf guard stays green.
