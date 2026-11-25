# record-cli

Records one turn of the real `claude` CLI over stream-json, for new fixtures in `src/main/claude/fixtures/`.

## Token rule

Each run is a real, billed turn. Haiku one-liners only, about 5 real turns per feature. Try the script against the fake CLI first (below), so the real run is right the first time.

## Usage

```
node tools/record-cli/record.mjs <workspace dir> <raw .jsonl> <script .json>
node tools/record-cli/sanitize.mjs <raw .jsonl> src/main/claude/fixtures/<name>.jsonl <workspace dir>
```

Use an empty temp folder as the workspace. The recorder sends `initialize`, then the prompt, allows every tool approval, and after the first `result` sends the script's control requests. It closes stdin `endAfterMs` after that result and kills the CLI's process tree after `killAfterMs`. It runs with `--no-session-persistence`. At the end it names every task with no `task_notification` and every process the CLI started that is still running (`LEFTOVER pid …`, exit code 3). End those yourself.

The raw log has one `{ direction: "host" | "cli", at, line }` per line. `sanitize.mjs` drops `initialize`, its reply and the `system/init` line. It replaces the workspace path with `C:\work\demo`, your home folder with `C:\home` and the session id with zeros. If your user name is still in the text, it stops with an error.

## Script

```json
{
  "prompt": "…",
  "model": "haiku",
  "afterResult": [{ "atMs": 2500, "subtype": "get_task_output", "fields": { "task_id": "{task_id}" } }],
  "endAfterMs": 9000,
  "killAfterMs": 60000,
  "extraArgs": []
}
```

Only `prompt` is required. `{task_id}` in `fields` becomes the id from the first `local_bash` `task_started`. `endAfterMs` defaults to the last `atMs` plus 2.5 s, and `killAfterMs` to 120 s. `background-bash.json` is the script behind `turn-background-bash.jsonl`.

## Dry run on the fake CLI

Set `CC_CLAUDE_BIN=tools/fake-claude/fake-claude.mjs` and `FAKE_CLAUDE_SCRIPT` to a fake script. The recorder then runs the fake with node, so it costs no tokens.
