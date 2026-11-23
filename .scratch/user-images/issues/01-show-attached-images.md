# 01: Your own message shows the images you attached

**What to build:** Andreas (2026-11-23), screenshot in chat: a sent message with a pasted screenshot shows the literal text `_[1 image attached]_` instead of the picture. "Feels bad not to see a preview in it."

Cause: `userItemText()` in `src/renderer/components/chat/promptHistory.ts` appends a marker, and the user ChatItem keeps only text. The image itself isn't stored.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **The bubble:** a user message renders its attachments under the text, as the VS Code extension does:
  - image thumbnails, about 160 px tall, as many per row as fit;
  - a file chip for PDF and text files;
  - the video chip, with a poster frame, for videos.

  Clicking an image opens the existing in-app preview, with arrows across this message's images. The marker text is no longer shown.
- [x] **Storage:** the user ChatItem gains `attachments: { kind, name, mediaType, thumb?: dataURL ≤ 320 px JPEG/PNG }`.
  - Thumbnails are made when you send. Full-size images are kept only in memory for the running session, for the preview. After a restart the preview uses the thumbnail, or, for a resumed chat, the transcript's original.
  - Persisted chat items must not grow by more than about 40 kB per image. Add a unit test that fails if a thumbnail exceeds that.
  - Keep `ATTACHED_MARKER` stripping for old saved items (back-compat), and migrate old items to show "1 image (not kept)".
- [x] **Resumed and VS Code chats:** user messages read back from a transcript `.jsonl` carry image blocks (base64). Render those as thumbnails too, decoded lazily and only when on screen, never re-encoded into storage. The read-only VS Code view gets the same.
- [x] **Media tab:** attached images already appear in Media. Check they still do, and that the thumbnail and the preview open the same file.
- [x] **Tests:**
  - pure: the attachment summary on the item, the thumbnail size cap, old-item migration, and transcript image blocks mapped to bubble attachments;
  - **no new UI scenario**: extend the existing attachments step in `e2e/chat.spec.ts` to paste an image, then assert the bubble shows an `img` thumbnail, the marker text is gone, and clicking opens the preview.
  - Gate: quick, e2e, perf and zoom.
