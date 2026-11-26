# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

`claimed` is the wayfinder flow's own word; the board shows a `claimed` ticket as In progress.

## Ticket lifecycle

Every ticket file has one status line near the top, `**Status:** <word>` (the bold is optional). An optional note follows an em dash: `**Status:** blocked — waiting on art`. The word is always one of:

| Word | Meaning | Who sets it |
| --- | --- | --- |
| `needs-triage` | Not looked at yet | whoever files it |
| `needs-info` | Waiting on the reporter | triage |
| `ready-for-agent` | Fully specified; an agent can take it | to-tickets / triage |
| `ready-for-human` | Needs Andreas | to-tickets / triage |
| `in-progress` | An agent is working on it | the implementing agent, **before its first edit** |
| `built` | Built and committed; waiting on a check only a person at a running app can make; the note says what | the implementing agent, **after its commit**, when any criterion is unticked for that reason |
| `blocked` | Started but stuck; the note says why | the implementing agent |
| `resolved` | Done and committed | the implementing agent, **after its commit** |
| `wontfix` | Will not be done | Andreas |

Rules:

- Never write any other word (`done`, `complete`, `talking`, …), and never put free text before the word. Partial completion stays `in-progress` with a note (`**Status:** in-progress — groups 1 and 2 done`).
- `**Blocked by:**` lists ticket numbers (`02, 02b`) or `None`. It is about dependencies between tickets; the `blocked` status is about a ticket that got stuck after it started.
- When a ticket's status changes, append one line to the feature's `progress.md`: `- NN <word>: <what happened> — <commit>`.
