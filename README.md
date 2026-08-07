# pi-packages

> In-TUI package manager for [pi](https://pi.dev). Adds a `/packages` command: list every configured package **with version numbers**, detect available updates on demand, and install / update / remove — all without leaving the TUI.

**Status: 📝 Draft (PRD only — not yet implemented).**

The full product spec, technical design, open questions, and phasing live in **[PRD.md](./PRD.md)**. Treat that file as the source of truth until implementation begins.

## Why

`pi list` shows package names, install paths, and git refs — but **not npm version numbers**, and there's no in-TUI way to manage packages or see what's outdated. `pi-packages` closes that gap:

- **See versions** for everything in one screen (the direct answer to *"where can I see installed packages and their versions?"*).
- **Detect updates** on demand (npm registry latest vs. installed; git remote vs. pinned ref).
- **Install / update / remove** from the TUI by orchestrating the `pi` CLI.

## Command surface

| Command | Action |
|---|---|
| `/packages` (alias `/pkg`) | open the interactive package manager |
| `/packages <src>` | jump straight to installing `<src>` |

## Architecture (summary)

- **Reads** parse `settings.json` + each package's `package.json` directly (offline, accurate, includes versions).
- **Mutations** shell out to the `pi` CLI (`pi install` / `remove` / `update`) — pi's `PackageManager` is the right abstraction but is not exposed to extensions.
- **Restart required** to apply changes — pi has no hot-reload path (verified). See PRD §8.7 / Appendix E.

## Status & next steps

1. Review and sign off on [PRD.md](./PRD.md) — especially Open Questions OQ1 (restart API) and OQ4 (default install scope).
2. Scaffold the package (`package.json`, `src/`) per PRD Appendix layout.
3. Implement MVP phase (PRD §11).

---

Owned-and-published package, following the release flow in the parent [`AGENTS.md`](../AGENTS.md) (tag-driven GitHub Actions + npm Trusted Publisher; never `npm publish` from a laptop).
