Done: pure digest renderer (src/main/features/digest.ts), debounced change-only writer (digestWriter.ts), wired in ipc.ts to stage, server, session, usage, profile and workspace changes; path via featureDigestFile() in util/paths.ts.
Checks: pnpm quick, build, pnpm e2e (17 of 20) green.
Next: self-review of the diff, then resolve.
