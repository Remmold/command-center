# 02: Memory facts and the health check on the map

**What to build:** the map shows how MEMORY.md reaches the memory files and flags the free problems (spec: `.scratch/context-analysis/spec.md`). The reader learns the memory facts, a pure health check turns a report into findings, and the map draws index-link edges, sets unindexed files apart, and shows findings on blocks.

Rules (from the spec, word for word):
- **Context report gains memory facts.** The reader adds, for the memory index item: its line count, its byte size, the memory files it links (from markdown links to `.md` files) and the index lines whose link target is missing. Each memory file item gets `indexed: boolean`, and unmatched `[[name]]` links within memory are collected (a match is a file's base name or its frontmatter `name`). CLAUDE.md items carry their character count. The report stays free of UI types.
- **Health check (shared, pure).** `healthCheck(report) → Finding[]`, with fixed rules:
  - MEMORY.md over 200 lines or over 25,600 bytes → one finding on MEMORY.md naming the first line that is cut off and how many lines are lost.
  - Each unindexed memory file → one finding on that file (verdict `structural`).
  - Each index line to a missing file → one finding on MEMORY.md.
  - CLAUDE.md (any layer, any import) over 40,000 characters → one finding.
  - Unmatched `[[links]]` → notes (`severity: 'note'`), never counted as problems.
  - Health finding ids are stable across redraws: `H-<rule>-<hash of path and detail>`.
- The `Finding` type (shared), exactly:

  ```ts
  type Finding = {
    id: string                           // F1, F2… (drift) or H-… (health)
    path: string                         // absolute path of the file it concerns
    verdict: 'stale' | 'wrong' | 'duplicate' | 'structural'
    severity: 'problem' | 'note'
    claim: string
    evidence: string
    fix: string
    status: 'open' | 'applied' | 'skipped'
  }
  ```
- On the map: lines from MEMORY.md to the memory files it links; unlinked memory files drawn apart from linked ones; findings show on their blocks as coloured dots and counts; a block's detail panel lists its findings (claim, evidence, fix).
- The health check runs whenever the map is drawn, with no tokens.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Reader tests (seam 1, the existing temp-folder tests): MEMORY.md line count, bytes, linked files, missing targets, `indexed`, unmatched `[[links]]` (by base name and frontmatter name), CLAUDE.md character counts.
- [ ] Health check tests (seam 2): 200 lines is fine and 201 is a finding; 25,600 bytes is fine and 25,601 is a finding; unindexed files; missing targets; 40,000 characters is fine and 40,001 is a finding; `[[links]]` as notes; ids stable between two runs.
- [ ] `mapLayout` tests: index-link edges, and findings attached to the right blocks.
- [ ] The map shows index edges, the unindexed set apart, and finding dots with counts; the detail panel lists findings.
- [ ] Real-data check: on Andreas's continuum workspace the health check reports MEMORY.md over 200 lines (225), and on darkfall64 it reports 137 unindexed files. If either comes out empty or different, find out why before resolving.
- [ ] Quick tier green.
