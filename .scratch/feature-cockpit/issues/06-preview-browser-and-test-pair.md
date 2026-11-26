# 06: Test button: boot the servers and open the test pair

**What to build:** a Test button on a feature with test steps boots its servers, then opens a test pair: the test flow in one window, the preview browser on the right page in another, with one hotkey to flip. Spec: `.scratch/feature-cockpit/spec.md` (user stories 22, 28–37; "Preview browser", "Test pair"). ADR 0008.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Test boots the feature's servers (ticket 04) and opens the pair once every server is Ready; a Failed server shows its output and Retry instead of an empty browser.
- [ ] The preview browser is one window per feature, titled with the feature's name, opening on the preview config's start page at the feature's port. It has its own persistent storage partition named after the feature.
- [ ] A pure navigation rule allows only localhost on the feature's own ports. Every other link opens in the default browser. No external page ever loads in the window (offline rule).
- [ ] Two features' preview browsers keep separate cookies and storage.
- [ ] One hotkey flips focus between the pair's two windows, from either; titles name the feature. Several features can have a pair open at once, also of one project.
- [ ] Test on a feature whose pair is open brings it to the front instead of opening a second.
- [ ] Each window reopens where it was last put, per feature and role (monitor and size).
- [ ] A workspace with no preview config opens only the test flow window.
- [ ] Carried from ticket 04's review: a server whose workspace is missing fails with a plain reason and never starts on the default account (spec story 59); a feature's ports are kept per server name, so reordering or renaming servers in the preview config never swaps ports between them; a failure inside the ready wait is caught and shown as that server's Failed reason, never an unhandled rejection.
- [ ] Vitest: the navigation rule (feature port allowed, another port, another host, a non-http scheme), window placement keys.
- [ ] No new UI suite scenario (ticket 08 covers the path).
