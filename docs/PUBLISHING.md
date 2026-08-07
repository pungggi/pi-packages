# Publishing `pi-packages`

`pi-packages` publishes to npm **from CI only** (tag-driven GitHub Actions).
Manual `npm publish` is blocked by `package.json` → `prepublishOnly`. This file
is the per-package companion to the parent [`AGENTS.md`](../../AGENTS.md) release
rules — read that first.

## Identity

| field | value |
|---|---|
| npm package | `pi-packages` (verified available — `npm view` → 404) |
| GitHub repo | `pungggi/pi-packages` |
| Workflow file | `release.yml` |
| Default branch | `main` |
| Visibility | **public** (`--access public`) |

---

## ⚠️ First publish (one-time bootstrap) — OIDC *cannot* create the package

npm Trusted Publishing requires the package to **already exist** before you can
attach a Trusted Publisher to it (you configure it on the package's own Settings
page, which only appears after the first publish — confirmed: npm docs
`trusted-publishers`, npm/documentation#1926). So the **first** release cannot
use OIDC. Publish it once via an **`NPM_TOKEN` (Classic Automation)** through CI:

1. **Create the token** — npmjs.com → Account → **Access Tokens → New Token** →
   type **Classic** → **Automation** (bypasses 2FA; Granular/Publish tokens fail
   with `EOTP`).
2. **Add the repo secret** — github.com/pungggi/pi-packages → **Settings →
   Secrets and variables → Actions → New repository secret** → name `NPM_TOKEN`,
   paste the token.
3. **Release v0.1.0** (see recipe below). The workflow detects the non-empty
   `NPM_TOKEN`, authenticates with it, and creates the package on npm.

> The scaffold is at `v0.0.0` on purpose — **don't publish the stub**. Do the
> first real publish at `v0.1.0` once the PRD MVP is implemented. If you want to
> claim the name / smoke-test the pipeline now, publishing `v0.0.0` is harmless
> but ships a non-functional placeholder.

---

## Steady state — npm Trusted Publisher (OIDC, preferred)

**After** the first publish exists on npm, switch to tokenless OIDC:

1. npmjs.com → **pi-packages → Settings → Trusted Publisher → GitHub Actions**:

   | field | value |
   |---|---|
   | Organization or user | `pungggi` |
   | Repository | `pi-packages` |
   | Workflow filename | `release.yml` (exact, no path) |
   | Environment | *(empty)* |
   | Allowed actions | `npm publish` |

2. **Harden** (recommended) — same page → **Settings → Publishing access →**
   "Require two-factor authentication and disallow tokens" → **Update**.
3. **Delete `NPM_TOKEN`** from the repo secrets (optional but recommended).
4. All subsequent tags now publish via OIDC — the workflow auto-detects OIDC
   mode when `NPM_TOKEN` is empty/unset. Provenance is generated automatically
   for trusted-publishing releases.

---

## Release recipe

```bash
cd ~/source/pi/packages/pi-packages

# 1. code, bump version, commit on main
npm run check                       # typecheck + test
# edit package.json → version X.Y.Z
git add -A && git commit -m "release: X.Y.Z"
git push origin main

# 2. tag MUST equal package.json version (release.yml enforces this)
git tag vX.Y.Z
git push origin vX.Y.Z

# 3. watch CI publish
gh run watch
npm view pi-packages version        # expect X.Y.Z

# 4. update local pi install
pi update npm:pi-packages
```

Or atomically:

```bash
npm version patch -m "release: %s"   # or minor / major
git push origin main --follow-tags
gh run watch && pi update npm:pi-packages
```

## Failed release

```bash
gh run rerun <run-id> --failed          # if the tag commit already has the fix
# or, only if the version never reached npm:
git tag -f vX.Y.Z && git push origin vX.Y.Z --force
```

Never retag a version that already landed on npm — bump instead.
