# PRD: `pi-packages` — In-TUI Package Manager for pi

| Field | Value |
|---|---|
| **Package name** | `pi-packages` (npm: `pi-packages`) |
| **Type** | pi package (single TypeScript extension + TUI component) |
| **Status** | Draft v0.1 |
| **Author** | _ |
| **pi keyword** | `pi-package` |
| **Repository** | `pungggi/pi-packages` (proposed; follows sibling convention) |
| **Scope decision** | Full manager: list + versions + available updates **and** install / remove / update (user-confirmed) |
| **Update detection** | On-demand ("refresh" action hits registries only when invoked) |

---

## 1. TL;DR

A pi extension that adds a **`/packages`** command. It opens an interactive, full-screen list of **every** configured package (user + project scopes), each row showing **name · type (npm/git/local) · scope · installed version or pinned ref · update-available badge**. From that screen you can **install** a new source, **update** one or all packages, and **remove** a package — all without leaving the TUI. Mutations shell out to the `pi` CLI; a restart is required to load the changes.

> **Why now:** `pi list` prints package names, install paths, and git refs — but **not npm version numbers**, and there is no in-TUI way to install/remove/update or see what's outdated. The user hit exactly this: "where can I see all installed packages and their versions?" Today the only answer is hand-reading each `package.json`. `/packages` closes that gap and adds management on top.

---

## 2. Background

- Configured packages live in the `packages` array of `settings.json`:
  - **Global (user scope):** `~/.pi/agent/settings.json`
  - **Project:** `<cwd>/.pi/settings.json` (`CONFIG_DIR_NAME` = `.pi` by default)
- Each entry is either a **source string** (`"npm:pi-schedule"`, `"npm:pkg@1.2.3"`, `"git:github.com/u/r@v1"`, `"https://..."`, `"/abs/path"`, `"./rel/path"`) or a **filter object** (`{ source, extensions, skills, prompts, themes }`).
- pi ships a full `PackageManager` (see Appendix A) with `install / remove / update / listConfiguredPackages / checkForAvailableUpdates / getInstalledPath` — **but it is not exposed to extensions**. There is no `ctx.packageManager` or `ctx.settingsManager`. The manager is constructed **once at startup** (`cli/startup-ui.js` → `new DefaultPackageManager(...)` → `resolve()`) and never re-run.
- **No hot-reload exists.** A repo-wide search for `reloadPackages` / `reloadExtensions` / `refreshPackages` returns nothing. Packages and their resources load at boot; changing them takes effect only on the next pi start.
- The `pi` CLI (`pi install`, `pi remove`, `pi update`, `pi list`) is a **separate process** that creates its own `DefaultPackageManager`, performs the mutation (edit settings + `npm install` / `git clone`), and exits. It is safe to invoke as a child of a running pi.

**The gap:** no in-TUI package management, no version column in `pi list`, and no `pi outdated`. `/packages` provides all three.

---

## 3. Goals

- **G1** — Show **all** configured packages (user + project) with their **installed version** (npm) or **pinned ref** (git), type, and scope — the thing `pi list` omits.
- **G2** — On demand, detect **available updates** (npm registry latest vs. installed; git remote HEAD vs. pinned ref) with a clear "updates available" badge and a per-row indicator.
- **G3** — **Install** a new package from a typed source string, **update** one or all packages, and **remove** a package — all from the TUI.
- **G4** — Make the **restart-to-apply** requirement obvious and safe (never silently half-apply; always reconcile displayed state with disk).
- **G5** — Feel native: same theming, keybindings, and progress/status affordances as `/resume` and `/config`; no external CLIs the user has to type.
- **G6** — Ship as a distributable `pi-package` (`pi install npm:pi-packages`), no bundled deps beyond pi peer packages.

## 4. Non-Goals

- Replacing `pi install` / `pi list` / `pi update` / `/config`. `/packages` orchestrates the CLI; it does not reimplement `npm`/`git` plumbing.
- Resource-level enable/disable (that is `/config`'s job — toggling individual extensions/skills/prompts/themes). `/packages` operates at the **package source** level only. (v2 may deep-link into `/config`.)
- A soft/hot reload of packages without restart — **API-blocked**: pi has no reload path (Appendix E, C1). Out of scope until/unless pi exposes one.
- Publishing or authoring packages (gallery submission, `npm publish` flows). The maintainer release flow stays in the shell (see repo `AGENTS.md`).
- Semantic search / "discover packages" browsing of the pi.dev gallery (v2+).

---

## 5. User Stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| US1 | multi-package user | type `/packages` and see **versions** for everything | I stop hand-reading `package.json` files (the `pi list` gap). |
| US2 | upgrader | press one key to **check for updates** and see badges | I know what's outdated before I touch anything. |
| US3 | upgrader | pick a package and **update just that one** | I upgrade deliberately, not blindly `--all`. |
| US4 | upgrader | **update all** with one action | I batch-upgrade without leaving the TUI. |
| US5 | installer | **install** `npm:foo` or a git URL by typing it | I add a package without dropping to a shell. |
| US6 | cleaner | **remove** a package with a confirm prompt | I prune what I don't use, safely. |
| US7 | multi-project dev | see **scope** (user vs. project) per row | I know whether a package is global or pinned to this repo. |
| US8 | anyone mutating | be told I must **restart** to apply changes | I'm not confused why nothing changed. |
| US9 | anyone | `Esc` to cancel and change **nothing** | browsing is always safe. |

---

## 6. Functional Requirements

### FR-1  Command surface
- Register command **`/packages`** via `pi.registerCommand("packages", { description, handler })`. No built-in collision exists (`/packages`, `/pkg`, `/install` are all free — verified).
- `/packages` takes no required args. Optional arg: a source string to **pre-fill the install prompt** (`/packages npm:foo` jumps straight to the install confirm).
- Alias **`/pkg`** registered the same way.

### FR-2  Reading configured packages (no network)
- On open, read both settings files (`~/.pi/agent/settings.json`, `<cwd>/.pi/settings.json`), extract the `packages` arrays, and produce a `ConfiguredPackageRow[]` (Appendix B).
- For each source resolve its **install path** (Appendix C) and read `package.json` to get:
  - npm → `version`
  - git → `version` (from the cloned repo's `package.json`) **and** the pinned ref (parsed from the source string after the last `@`)
  - local → `version` if a `package.json` exists, else "(local, no manifest)"
- **Deduplication / precedence** mirrors pi core: if the same package identity appears in both scopes, the **project entry wins** unless it has `autoload: false` (then it's a delta over global). Show the winning row; optionally show a "also in global" hint.
- This read path is **synchronous-feeling and offline** — it is the answer to the "versions" pain.

### FR-3  Update detection (on-demand only)
- A **`r`/refresh** action (and an explicit "Check for updates" row/button) checks each package against its source:
  - npm → `npm view <name> version` (latest); compare semver against installed.
  - git → `git ls-remote <url> HEAD` (or the upstream default branch); compare against the pinned ref.
- Runs with bounded concurrency (e.g. 6) and a per-package timeout (e.g. 8s); failures degrade to an "unknown" state, never block the list.
- Results are **cached in-memory for the session** and re-checked only on explicit refresh (user chose on-demand — no background traffic on open).
- Show: a column/badge `⬆ N updates`, and per-row `update available` / `up to date` / `pinned` (versioned npm specs and git refs are intentionally not auto-moved; mark them `pinned`).

### FR-4  Mutations (shell out to `pi` CLI)
All mutations spawn the `pi` CLI as a child process (Appendix D), stream progress to a status line, and update the in-memory model on success.
- **Install:** open an input for the source string (pre-filled if `/packages <src>`). On confirm: `pi install <src>` (or `pi install -l <src>` for project scope — scope chosen via a toggle, default **user**). Add the resulting row.
- **Update selected:** `pi update <src>` (moves the single source).
- **Update all:** `pi update --all` (pi + packages + reconcile git refs). Confirm first; this is the heaviest action.
- **Remove:** `pi remove <src>` (or `-l`). Confirm before removal. Remove the row on success.
- **Restart prompt after any mutation:** notify clearly that changes load on next start. Offer a **"Restart pi"** affordance if pi exposes a restart mechanism (Open Question OQ1); otherwise instruct: close and relaunch pi (or `/exit` then re-run).

### FR-5  Modes
- **TUI (`ctx.mode === "tui"`):** full interactive screen (§7).
- **RPC (`ctx.mode === "rpc"`):** fall back to `ctx.ui.select(...)` for a headless picker of read-only info + confirm dialogs; mutations still shell out.
- **Print / JSON (`-p`, `--json`):** print the package table (name · type · scope · version/ref · update) as plain text or JSON and exit. Useful for scripting (`pi -e`-style). No mutation in print mode.

### FR-6  Configurability (settings)
Optional keys under a `packages` command config object in `settings.json`:
| Key | Default | Purpose |
|---|---|---|
| `defaultScope` | `"user"` | default scope for install (`"user"` \| `"project"`) |
| `checkTimeoutMs` | `8000` | per-package update-check timeout |
| `checkConcurrency` | `6` | parallel update checks |
| `confirmUpdateAll` | `true` | prompt before `pi update --all` |
| `confirmRemove` | `true` | prompt before `pi remove` |
| `showPinnedAsUpToDate` | `false` | how to render pinned sources with no newer ref |

> Until pi exposes a settings-read API to extensions, these are read directly from the same `settings.json` files (the extension already parses them for the package list) — no new API needed.

---

## 7. UX Design (TUI)

Custom component via `ctx.ui.custom(...)`, consistent with pi theming:

```
┌ Packages                                                            (scope: user + project) ─┐
│                                                                                            │
│   SOURCE                          TYPE   SCOPE    VERSION / REF          UPDATE                │
│ ▸ npm:pi-mcp-adapter              npm    user     2.21.0                 up to date            │
│   npm:pi-auggie-router            npm    user     1.5.0                  up to date            │
│   npm:pi-schedule                 npm    user     0.3.2                  ⬆ 0.3.3 available     │
│   npm:pi-ghost-autocomplete       npm    user     0.8.1                  up to date            │
│   git:github.com/pungggi/pi-sync  git    user     @39a1d9f (pinned)      pinned                │
│   ../../source/pi/.../pi-extension local  project  (local, no manifest)   —                     │
│   …                                                                                         │
│                                                                                            │
│   12 packages · 1 update available                                                         │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ navigate  Enter details  i install  u update  U update all  x remove  r refresh  Esc ✕  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Detail pane** (on `Enter`): full source string, resolved install path, manifest `name`/`version`/`description`, scope, type, ref, update status, and actions contextual to that package (update / remove / open path).

**Install modal** (on `i`): a single-line input for the source string with a live hint of accepted formats and a scope toggle (`Tab` user ⇄ project). Submit runs `pi install`.

**Progress:** long operations stream to the status line ("Installing npm:foo…", "Updating — 3/12") using the child process's stdout; a spinner during registry/git checks.

**Keybindings** (mirror pi conventions):
| Key | Action |
|---|---|
| `↑`/`↓` | navigate |
| `Enter` | open detail pane |
| `i` | install (source input) |
| `u` | update selected |
| `U` | update all (confirm) |
| `x` / `Delete` | remove selected (confirm) |
| `r` | refresh / check for updates |
| `/` | filter rows by typed substring |
| `Tab` | toggle scope focus: all ⇄ user ⇄ project |
| `Esc` / `Ctrl+C` | close / cancel |

---

## 8. Technical Design

### 8.1  Data flow

```
/packages
   │
   ▼
readSettings()                              ← extension: parse global + project settings.json
   │  → ConfiguredPackageRow[]  (source, scope, type, version/ref, installPath)
   ▼
PackagesComponent (ctx.ui.custom)           ← extension: interactive list + actions
   │
   ├── (view)        render rows (offline, instant)
   ├── (refresh)  →  checkUpdates(rows)     ← extension: npm view / git ls-remote, bounded concurrency
   ├── (install)  →  spawn `pi install <src>` → reconcile row from disk
   ├── (update)   →  spawn `pi update <src>`  → re-read version
   ├── (updateAll)→ spawn `pi update --all`   → re-read all
   └── (remove)   →  spawn `pi remove <src>`  → drop row
   │
   ▼
after any mutation: notify "restart pi to apply" (+ offer restart if available)
```

### 8.2  Core modules
- `index.ts` — factory; registers `/packages` (+ `/pkg` alias) and the print/json fallback.
- `settings.ts` — read/parse both `settings.json` files; normalize the `packages` array (strings + filter objects) into `ConfiguredPackageRow[]`; apply project-wins precedence.
- `sources.ts` — pure helpers: `parseSource(str)` → `{ type, name, ref?, url?, path? }`; `resolveInstallPath(parsed, scope, agentDir, cwd)`; `readManifest(installPath)` → `{ name, version, description? }`. Fully unit-testable, no pi imports.
- `updates.ts` — `checkUpdates(rows, { concurrency, timeoutMs })` → shells out to `npm view` / `git ls-remote`; semver compare (tiny, dependency-free).
- `actions.ts` — `install/remove/update/updateAll` wrappers that spawn the `pi` CLI and stream progress; return a result the UI reconciles from.
- `packages.tsx` — the TUI component (uses `@earendil-works/pi-tui`).
- `config.ts` — merge `packagesCommand` settings with defaults.

### 8.3  Why shell out to the CLI (key recommendation)
The `PackageManager` is the *right* abstraction but it is **not exported to extensions** (Appendix E, C2). We therefore do **not** reimplement install/remove/update logic. The `pi` CLI already encapsulates: settings edit + `npm install`/`git clone` + ref pinning + dependency install + `.gitignore`/`ensureNpmProject`. Shelling out guarantees `/packages` stays correct as pi's packaging internals evolve. The extension owns only **presentation, version resolution, and update detection** — things the CLI does poorly or not at all.

### 8.4  Version resolution detail
- **npm:** install path = `<agentDir>/npm/node_modules/<name>/` (user) or `<cwd>/.pi/npm/node_modules/<name>/` (project). Read `package.json` → `version`.
- **git:** install path = `<agentDir>/git/<host>/<path>/` (user) or `<cwd>/.pi/git/<host>/<path>/` (project). Read `package.json` → `version`; ref = substring after the final `@` in the source (when present).
- **local:** the path itself; read `package.json` there if it exists.
- Use the running pi's `getAgentDir()` equivalent (`~/.pi/agent`) and `CONFIG_DIR_NAME` (import from `@earendil-works/pi-coding-agent`) instead of hardcoding `.pi`, so rebranded distributions still resolve correctly.

### 8.5  Update detection detail
- **npm:** `npm view <name> version` returns latest published. Compare with `semver`-style compare (ship a ~30-line compare; no dependency). Versioned specs (`npm:foo@1.2.3`) are **pinned** → label `pinned`, never "update available" (matches `pi update` skipping them).
- **git:** pinned ref vs. remote. `git ls-remote <url> <ref-or-HEAD>`; if remote moved beyond the pinned commit, `update available`. Refs that are explicit tags/commits are `pinned`.
- **Concurrency + timeouts:** `runWithConcurrency`-style limiter; each check wrapped in a timeout; one failure never aborts the batch. Cache results in memory; only re-check on explicit `r`.

### 8.6  Trust & safety
- Mutations that target **project scope** only run when `ctx.isProjectTrusted()` (project trust governs `.pi/settings.json`). Respect it; never write project settings for an untrusted project.
- The extension never bypasses pi's own trust/install flows — it invokes them via the CLI.
- Security note for users: installing third-party packages runs arbitrary code (per `docs/packages.md`). Surface a one-line warning on the install confirm for non-npm-known sources; defer to pi's existing trust model otherwise.
- No telemetry; no registry data leaves the machine except the explicit `npm view`/`git ls-remote` the user triggers.

### 8.7  Restart / apply semantics
- Because there is **no reload path** (Appendix E, C1), every successful mutation ends with: reconcile the in-memory row(s) from disk **and** notify "Changes saved — restart pi to load them."
- If OQ1 resolves that pi has a restart command/shortcut, wire a **"Restart now"** button to it. Otherwise the notify instructs a manual restart. We never claim the change is live in the current process.

---

## 9. Edge Cases & Error Handling

| Case | Behavior |
|---|---|
| `packages` array missing/empty in settings | Show "No packages configured. Press `i` to install one." |
| Entry is a filter object, not a string | Use its `source` field; show a "filtered" marker; mutations operate on the source. |
| Install path missing (not yet installed) | Show "not installed" version; offer update/install via CLI (`pi` auto-installs missing sources on next start). |
| Local path moved/deleted | Show "missing path"; remove from list only via explicit `pi remove`. |
| `pi install` child fails (network, auth, bad source) | Stream stderr to the status line; notify error; do **not** mutate the list. |
| Windows file-lock during `pi update` (parent has modules loaded) | Surface the CLI error; advise closing pi and retrying from a shell. Track as a known limitation. |
| `npm view`/`git ls-remote` offline or slow | Timeout → row shows "update unknown"; never blocks. |
| Same package in both scopes | Project wins (unless `autoload:false` delta); show "also in global/project" hint on the detail pane. |
| Versioned npm spec (`npm:foo@1.2.3`) | Label `pinned`; excluded from "update all" semantics that imply moving versions. |
| Concurrent `/packages` + shell `pi install` | Both edit the same `settings.json`; last writer wins. On focus/refresh, re-read settings to reconcile. |
| `ctx.mode` is `print`/`json` | Print the table / JSON; no mutation. |
| User removes the currently-running `/packages` package itself | Allow with a strong confirm; warn it unloads on restart. |

---

## 10. Testing Plan

- **Unit (`sources.ts`):** parse every source shape (npm, npm@ver, git shorthand, git SSH, https, ssh://, abs path, rel path); resolve install paths per scope; read manifest present/absent; ref extraction.
- **Unit (`settings.ts`):** normalize string vs object entries; project-wins precedence; `autoload:false` delta; empty/missing arrays.
- **Unit (`updates.ts`):** semver compare (equal/older/newer/pre-release); pinned detection; timeout + failure → "unknown"; concurrency cap.
- **Integration (mocked CLI):** stub the `pi` spawn to assert correct args per action (`install`, `install -l`, `update <src>`, `update --all`, `remove`, `remove -l`); assert progress events and post-action reconciliation.
- **Integration (manual):** in a throwaway agent dir (`PI_AGENT_DIR`/temp), install/remove/update real packages; verify version column updates after mutation; verify restart loads the change; verify trust gate blocks project-scope writes for untrusted cwd.
- **Regression:** `/config`, `/resume`, and `pi list`/`pi update` continue to work unchanged (we only add + orchestrate).

---

## 11. Phasing

| Phase | Scope | Outcome |
|---|---|---|
| **MVP** | `index.ts` + `settings.ts` + `sources.ts`; `/packages` using `ctx.ui.select` (no custom TUI); offline version/ref/scope list. Update detection + mutations via CLI. Restart notify (no button). | Directly solves the "see versions" + "manage without leaving TUI" pain. Shippable. |
| **v1** | Custom `PackagesComponent` (§7): columns, badges, detail pane, filter, scope toggle, progress streaming. Tests. Settings knobs. | Production polish. |
| **v1.1** | "Restart now" button (if OQ1 resolves to a restart API). `/pkg` alias polish. Print/JSON table. | Convenience. |
| **v2** | Deep-link a package's detail pane into `/config` (resource enable/disable); gallery browse/install from pi.dev; bulk select + multi-update/remove. | Ecosystem surface. |

---

## 12. Open Questions

1. **OQ1 (pivotal for UX):** Does pi expose a **restart** or **reload** command/shortcut we can invoke so mutations apply without a manual exit? If yes, `/packages` offers "Restart now". If no, manual restart only. *(Verified: no reload path exists; restart API unconfirmed — check keybindings.md / commands during implementation.)*
2. **OQ2:** Is there an official way for extensions to **read settings** (so we don't parse `settings.json` by hand), e.g. a `ctx.settings`? The session-finder PRD found none. If one exists now, prefer it; otherwise direct file parse is safe (paths are stable, Appendix C).
3. **OQ3:** For **update detection**, prefer `npm view`/`git ls-remote` (our own) or is there an undocumented `pi outdated`? *(Verified: none exists.)* Our own checks are the path; confirm acceptable latency in MVP.
4. **OQ4:** Should **install** default to user or project scope? Propose **user** (matches the common case and `pi install` default), with `Tab`/`-l` to switch.
5. **OQ5:** Versioned npm specs and git refs are `pinned` — should `/packages` still let users **force** a move (re-tag/upgrade) from the TUI, or defer to the shell? Propose: allow via detail-pane "change version/ref" in v1.1, not MVP.

---

## 13. Out of Scope

- Soft/hot reload of packages without restart (API-blocked — C1).
- Resource-level enable/disable (owned by `/config`).
- Package authoring / publishing / gallery submission (owned by maintainer shell flow, `AGENTS.md`).
- Reimplementing `npm`/`git` install internals (owned by the `pi` CLI / `PackageManager`).
- Dependency-tree inspection of installed packages.

---

## Appendix A — `PackageManager` interface (from `dist/core/package-manager.d.ts`)

> **Not exposed to extensions** — documented here to explain what we *can't* call directly and what the CLI wraps.

```ts
interface PackageManager {
  resolve(onMissing?): Promise<ResolvedPaths>;
  install(source, opts?): Promise<void>;
  installAndPersist(source, opts?): Promise<void>;
  remove(source, opts?): Promise<void>;
  removeAndPersist(source, opts?): Promise<boolean>;
  update(source?): Promise<void>;
  listConfiguredPackages(): ConfiguredPackage[];
  checkForAvailableUpdates(): Promise<PackageUpdate[]>;
  getInstalledPath(source, scope): string | undefined;
  addSourceToSettings(source, opts?): boolean;
  removeSourceFromSettings(source, opts?): boolean;
  setProgressCallback(cb): void;
}
interface ConfiguredPackage { source: string; scope: "user" | "project"; filtered: boolean; installedPath?: string; }
interface PackageUpdate { source: string; displayName: string; type: "npm" | "git"; scope: "user" | "project"; }
```

## Appendix B — `ConfiguredPackageRow` (extension model)

```ts
interface ConfiguredPackageRow {
  raw: string;                 // exact settings entry (string or object.source)
  parsed: { type: "npm" | "git" | "local"; name?: string; ref?: string; url?: string; path?: string };
  scope: "user" | "project";
  filtered: boolean;           // entry was a filter object
  installPath?: string;        // resolved on disk
  version?: string;            // from manifest
  ref?: string;                // git pinned ref
  update?: "up-to-date" | "available" | "pinned" | "unknown";
  alsoInOtherScope?: boolean;  // dedupe hint
}
```

## Appendix C — Paths & resolution

| Item | Value |
|---|---|
| Agent dir | `~/.pi/agent` (`getAgentDir()`) |
| Global settings | `~/.pi/agent/settings.json` |
| Project settings | `<cwd>/<CONFIG_DIR_NAME>/settings.json` (`.pi` default) |
| npm install (user) | `~/.pi/agent/npm/node_modules/<name>/` |
| npm install (project) | `<cwd>/.pi/npm/node_modules/<name>/` |
| git install (user) | `~/.pi/agent/git/<host>/<path>/` |
| git install (project) | `<cwd>/.pi/git/<host>/<path>/` |
| Version source | `package.json` → `.version` at the install path |

## Appendix D — CLI commands wrapped

| Action | Command | Notes |
|---|---|---|
| Install (user) | `pi install <src>` | writes global settings |
| Install (project) | `pi install -l <src>` | writes `.pi/settings.json`; trust-gated |
| Update one | `pi update <src>` | moves a single source |
| Update all | `pi update --all` | pi + packages + reconcile git refs |
| Remove (user) | `pi remove <src>` | |
| Remove (project) | `pi remove -l <src>` | |
| (read) | `pi list` | we don't depend on it — we parse settings directly for versions |

## Appendix E — Constraints & evidence (decision → verified fact)

| ID | Design decision | Grounded in (verified) | PRD section |
|---|---|---|---|
| **C1** | After any mutation, **restart required** (no soft reload); offer "restart now" only if an API exists. | Repo-wide search for `reloadPackages`/`reloadExtensions`/`refreshPackages` → none. `DefaultPackageManager` constructed once in `cli/startup-ui.js` → `resolve()` at boot. | §2, §8.7, OQ1 |
| **C2** | **Shell out to the `pi` CLI** for install/remove/update instead of calling `PackageManager` directly. | `PackageManager`/`settingsManager` are **not** on `ExtensionContext` (types.d.ts); no `ctx.packageManager`. | §8.3, App. A |
| **C3** | Read packages + versions by **parsing settings.json + package.json** (not via `pi list`). | `pi list` omits npm versions; settings paths are stable and documented (`docs/packages.md`, `settings-manager.js`). | §8.2, §8.4 |
| **C4** | **On-demand** update detection only (no open-time network). | User-confirmed scope decision; also matches the latency/privacy posture of sibling packages. | §FR-3 |
| **C5** | Use `CONFIG_DIR_NAME` / `getAgentDir()` instead of hardcoded `.pi`. | `config.d.ts` exports both; rebrands can change the dir name. | §8.4, App. C |
| **C6** | `/packages` + `/pkg` are free (no built-in collision). | Searched registered command names for `package`/`install`/`pkg` → none. | §FR-1 |
