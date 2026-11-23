# 01: Find each repo's own icon automatically

**What to build:** Andreas: "can it automatically find icons in the repos to use as the icon on the side?" Today a workspace shows a coloured letter unless he picks an image (`src/main/repoIdentity/`). Find a fitting icon in the repo and use it automatically, and keep his own picks.

What his workspaces contain (checked read-only 2026-11-23):

| Workspace | What it has |
| --- | --- |
| nordkastell | `brand/png/app-icon-dark-1024.png` / `-light-1024.png`, `apple-touch-icon-180.png`, favicons |
| continuum | `apps/dashboard/public/favicon.svg` and `apps/marketing/public/favicon.svg` (a monorepo) |
| darkfall-companion | `frontend/public/favicon.png`/`.ico`, `design-system/.../assets/logo.svg` |
| command-center | `resources/icons/icon.png` |
| darkfall64, Darkfall | no image files; `RiseOfAgon.exe` at the root |
| FantasySurvival, Agon-survivors | Unity projects (`ProjectSettings/`, `Build(s)/`) |
| Test | nothing, so it keeps the letter |

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Candidate finder (main process, read-only, pure ranking).** Walk the repo to depth 4. Skip `node_modules`, `.git`, `Library`, `Temp`, `obj`, `dist`, `out`, `release`, `build`, `.next` and anything in `.gitignore`. Use the existing ripgrep file lister from the mentions work where possible. Collect, best first:
  1. App icons by name: `app-icon*`, `apple-touch-icon*`, `icon.(png|svg|ico)`, `logo.(png|svg)`, `favicon.(svg|png|ico)`, `mstile*`, plus Electron `build/icon.*` and `resources/icon*`. Prefer square images of at least 128 px, then SVG, then ICO, then small PNG. Prefer `dark` variants on the dark theme. Read PNG sizes from the header; don't decode whole files.
  2. Unity: in `ProjectSettings/ProjectSettings.asset`, the default or build-target icon GUID. Find the `.meta` with that `guid:` under `Assets/` and use its texture.
  3. Godot: `project.godot` → `config/icon`.
  4. Windows executables at the root or in `Build/`, `Builds/`, `Run/`, `bin/` (not `node_modules`): the exe's own icon through Electron `app.getFileIcon(path, { size: 'large' })`. Skip icons that are only the generic Windows exe icon; compare against the icon of a known plain exe.
  5. None of these: keep the letter avatar.

  Monorepos: candidates under `apps/<name>/` or `packages/<name>/` rank below the root, and the order between apps is stable (alphabetical).
- [ ] **Applying:**
  - A workspace with no icon of the user's own gets the best candidate automatically, on add and on first start after this update.
  - An icon the user picked is never replaced.
  - Results are cached in the repo-icon store, copied as the existing store does with picked images; nothing is written into the repo.
  - Re-detect on demand, and when the chosen file disappears.
- [ ] **Settings → Workspaces, icon picker:** a **Found in this repo** row of every candidate's thumbnail with its path on hover. Click to use one. Also **Use letter** and **Detect again**. Mark which icon is automatic and which was picked.
- [ ] **Everywhere icons show:** the Work list, chat headers, Dashboard, Board and notifications (which already use the repo icon) all pick it up.
- [ ] **Safety:** read-only in repos. Never run an executable; `getFileIcon` only reads its resources. Cap the walk at about 5,000 files per repo and 2 seconds, and run it in the background so start-up isn't delayed.
- [ ] **Tests:**
  - pure ranking: name patterns, size preference, dark variants, monorepo order, the generic-exe filter;
  - the Unity GUID-to-meta resolution and the Godot reader, both against fixture files;
  - an e2e with a temp workspace holding `public/favicon.svg` and `brand/app-icon-1024.png`: the app icon is chosen automatically, the picker lists both, and a user pick stays after Detect again.
  - The perf guard stays green.
