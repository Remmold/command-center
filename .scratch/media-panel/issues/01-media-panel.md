# 01: Media panel beside the chat

**What to build:** a toggleable **Media** panel on the right of the current chat. It shows a thumbnail of every image and video that chat touched, newest first. Clicking one opens the existing in-app preview (added in 0.1.4 with `fileOpener`). Videos play in that preview.

Decided by Andreas (2026-11-23):
- the panel sits beside the chat, not as a new top-level view;
- sources are the files the chat read or wrote, paths mentioned in Claude's replies, and the user's own attachments;
- the app does not scan folders.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Collecting media (pure model, from the chat's items):**
  - image and video paths from Read, Write and Edit tool calls, and from tool output text, e.g. Blender or MCP results that name `.png` files;
  - file links and paths in assistant text, using the link detection from the transcript-look work;
  - the user's pasted or dropped image attachments, which are kept in memory or as data, not as files.

  Extensions: png, jpg, jpeg, gif, webp, svg, bmp for images; mp4, webm, mov, mkv for video.

  Paths resolve against the chat's workspace, as `fileOpener` does. Remove duplicates by resolved path, keeping the newest mention. Keep the message each item came from, so it can scroll to it.
- [x] **The panel:**
  - toggled from a Media button in the chat header (an image icon with a count) and by a shortcut. Pick one with no clash in the shortcut map, e.g. Ctrl+Shift+M; check VS Code's meaning for it and avoid conflicts;
  - resizable, with its width remembered;
  - a grid of thumbnails at about 120 px, each showing the file name and the time it was mentioned;
  - videos show a poster frame and a play icon;
  - a missing file shows a "file not found" tile instead of being hidden;
  - the panel follows the focused chat; each half of a split view has its own;
  - the read-only VS Code view gets it too.
- [x] **Tile actions:** click opens the preview. The preview has left and right arrows to step through this chat's media. Hover shows **Jump to message** (scrolls the transcript there) and **Open externally**. Right-click offers Copy path and Reveal in Explorer.
- [x] **Loading:**
  - thumbnails load lazily, only when visible;
  - images come from the main process through a safe local-file route (a custom protocol or IPC data URL), only for paths the chat itself named, and read-only;
  - large files are scaled by the browser, not decoded at full size: use `img` with a fixed size and `decoding="async"`;
  - nothing is written to disk.
- [x] **Updating:** new media appears in the panel as the turn streams, without re-rendering the transcript. Keep the memo and perf guard green.
- [x] **Tests:**
  - the pure collection model: tool calls, tool output paths, reply links, attachments, duplicates, video vs image, relative and absolute paths;
  - an e2e on the fake CLI with a temp workspace holding a png and a small webm (generate the webm, or use a tiny one built with an existing tool; don't download anything). Check that:
    - the panel shows both;
    - clicking the png opens the preview, and the arrows move to the video;
    - Jump to message scrolls the transcript.
  - The perf guard and zoom overflow checks stay green.
