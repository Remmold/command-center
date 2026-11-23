# 01: Drop a video into a chat, and Claude gets frames and a transcript

**What to build:** Andreas (2026-11-23): "I want to make you able to read videos and use them as context." Claude reads images and text, not video in any format, so a dropped video is turned into both:
- **scene-change key frames** with timestamps, tiled into a few contact sheets;
- a **timestamped transcript** of the speech.

Decided: frames plus transcript; the transcription model is **whisper small, multilingual** (about 470 MB, Swedish and English), downloaded once and run locally.

**Blocked by:** None (can start immediately)

**Status:** resolved

Facts checked on Andreas's machine:
- ffmpeg 9.0 is installed (gyan.dev full build, winget) at `C:\Users\remmold\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffmpeg.exe`, also on PATH;
- `ffmpeg -filters` lists the **whisper** filter (whisper.cpp), so transcription needs no Python;
- faster-whisper is not installed.

- [x] **Accepting videos:** the existing attachment paths (paste, drag-drop, the paperclip) accept mp4, webm, mov, mkv and avi, plus gif treated as video. Today these are refused as unsupported. A video chip shows the name, duration and a "preparing…" state.
- [x] **Frames (main process, read-only on the source):**
  - Use ffprobe for the duration and size.
  - Use ffmpeg scene detection (`select='gt(scene,T)'`) with a minimum spacing, always including the first and last frame, and capped at **24 frames**. For a static video, fall back to evenly spaced frames.
  - Scale each frame to at most 768 px on the long side. Burn its timestamp in a corner, or caption it.
  - Tile the frames into contact sheets of at most about 1,568 px on the long side (Claude's sweet spot), 2×2 or 3×3 depending on the aspect ratio. Each sheet goes in as one image block.
  - Write everything to a temp folder in app data, and clean it up after sending.
- [x] **Transcript:**
  - Extract the audio and run ffmpeg's `whisper` filter with the small multilingual ggml model, detecting the language, and write timestamped segments.
  - Skip it when there's no audio stream, or the audio is near silent.
  - Send the transcript as a text block in this shape:

    ```
    Video: <name> · 1:42 · 24 frames on 3 sheets
    [00:00:03] …
    [00:00:11] …
    ```

    Truncate it with a note if it's very long.
- [x] **Model download:**
  - The first video with audio asks once: "Download the speech model (whisper small, 470 MB) to transcribe videos? It runs on this computer." The choices are **Download** and **Frames only**, and the answer is remembered.
  - It downloads from the official whisper.cpp ggml model source with a progress bar, verifies the file's hash or size, and stores it under app data `models/`. It can resume or retry.
  - Settings → General gets a **Video** row: transcription on or off, the model status, and Remove model.
- [x] **Finding ffmpeg:** use the system ffmpeg (from PATH or the winget location). If it's missing, the chip says "Video needs ffmpeg" and links to how to install it (`winget install Gyan.FFmpeg`). Don't bundle it. If the ffmpeg has no whisper filter, send frames only and say so.
- [x] **Before sending:**
  - Show a preview of the sheets and a transcript excerpt on the chip (click to expand), with an estimated token cost.
  - Sending is blocked until preparation finishes, or the user can cancel.
  - Preparation must not freeze the UI: run it in the main process with progress events.
- [x] **Media tab:** the original video and its sheets appear in the chat's Media tab.
- [x] **Tests:**
  - pure: the frame selection plan (scene times, spacing, cap, fallback), the sheet layout, the transcript formatter, the token estimate;
  - an integration test that runs the real ffmpeg on a tiny video **generated with ffmpeg itself** (testsrc and sine, about 6 s, with a cut) and asserts frames, sheets and timestamps. Skip with a notice when ffmpeg isn't present.
  - For transcription, use the **tiny** ggml model in a temp folder for any real run, never Andreas's app data, and skip in CI when it's absent.
  - Extend an existing attachment UI scenario (don't add one) so that dropping a generated video produces a chip, and the fake CLI receives image blocks plus a text block.
  - The perf guard stays green.
