# 01: Dashboard and Board polish, judged from screenshots

**What to build:** Andreas asked for a Dashboard that shows the most important data at a glance and a Board that reads like a GitHub Projects board, in the VS Code Dark Modern look, without clutter ("useful programs have very clear cut" looks). Take screenshots of both views on realistic fake data, judge them against VS Code and GitHub Projects, and fix what falls short.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Seed a realistic temp workspace set (3–4 repos with `.scratch` features and tickets in every lifecycle status, several sessions in different states: running, waiting on approval, idle) using the fake CLI; never Andreas's data
- [x] Screenshot Dashboard and Board (Playwright on the built app) at 1440×900 and a narrow ~1100 px width; save under `.scratch/polish/shots/before-*.png`
- [x] Write a short critique list in `.scratch/polish/critique.md`: what a glance should answer on the Dashboard (what needs me, what's running, what moved, account usage), what GitHub Projects does that the Board doesn't (column counts, card density, labels, card detail on click, empty states), alignment/spacing/typography inconsistencies with VS Code Dark Modern
- [x] Fix the top items (pick by impact; log each choice as a decision); no new features beyond presentation and readability, no new data sources
- [x] After screenshots `after-*.png` beside the before ones
- [x] Tests: pure models touched get unit tests; existing e2e stays green; add a smoke assertion only where a fix changes behaviour
