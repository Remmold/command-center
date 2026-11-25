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

**Status:** resolved

- [x] Reader tests (seam 1, the existing temp-folder tests): MEMORY.md line count, bytes, linked files, missing targets, `indexed`, unmatched `[[links]]` (by base name and frontmatter name), CLAUDE.md character counts.
- [x] Health check tests (seam 2): 200 lines is fine and 201 is a finding; 25,600 bytes is fine and 25,601 is a finding; unindexed files; missing targets; 40,000 characters is fine and 40,001 is a finding; `[[links]]` as notes; ids stable between two runs.
- [x] `mapLayout` tests: index-link edges, and findings attached to the right blocks.
- [x] The map shows index edges, the unindexed set apart, and finding dots with counts; the detail panel lists findings.
- [x] Real-data check: on Andreas's continuum workspace the health check reports MEMORY.md over 200 lines (225), and on darkfall64 it reports 137 unindexed files. If either comes out empty or different, find out why before resolving.
- [x] Quick tier green.

## Comments

- Real-data check (2026-11-25, default account): darkfall64 reports 137 unindexed memory files of 396, no missing targets. Continuum reports the one MEMORY.md finding (225 lines), but the cut is at line 183, not 201: the file is 32,480 bytes, the first 182 lines take 25,595 bytes and line 183 crosses 25,600, so the byte limit cuts first and 43 lines are lost, not 25. The spec's "last 25 index lines" counted only the line limit. Continuum also has 38 unmatched `[[links]]` (notes), darkfall64 none.
