# Publishing `pi-packages`

`pi-packages` publishes to npm **from CI only**, tag-driven via GitHub Actions
using **npm Trusted Publishing (OIDC)** — no long-lived token required. Manual
`npm publish` is blocked by `package.json` → `prepublishOnly`. This file is the
per-package companion to the parent [`AGENTS.md`](../../AGENTS.md) release rules.

## Current state (steady) — remembered

| | |
|---|---|
| npm package | `pi-packages` — **published & bootstrapped** (`0.0.0` live; `latest = 0.0.0`) |
| Auth | **npm Trusted Publishing (OIDC)** — configured on npmjs.com; no `NPM_TOKEN` secret needed |
| Provenance | **automatic** under trusted publishing (`id-token: write` + public repo + npm ≥ 11.5.1). `release.yml` also passes `--provenance` to cover the optional token fallback |
| Guard | `prepublishOnly` active → `npm publish` only runs in CI |
| Workflow | `.github/workflows/release.yml`, triggers on `v*.*.*` tags |

> The earlier "unblock for manual publish" override is **rolled back**.
> Publishing is CI-only again; local `npm publish` is intentionally blocked.

## Release recipe (tag-driven)

```bash
cd ~/source/pi/packages/pi-packages

# 1. implement / bump (version must be > currently published, i.e. > 0.0.0)
npm run check                       # typecheck + test
# edit package.json → version X.Y.Z
git add -A && git commit -m "release: X.Y.Z"
git push origin main

# 2. tag MUST equal package.json version (release.yml enforces this)
git tag vX.Y.Z
git push origin vX.Y.Z

# 3. CI publishes via OIDC + provenance — no manual step
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

## How provenance stays hands-off

`release.yml` guarantees the OIDC/provenance prerequisites so a tag push just works:

1. Job `permissions: id-token: write` (OIDC token + provenance signing).
2. `npm install -g npm@latest` → npm ≥ 11.5.1.
3. Node 22.x (≥ 22.14) via `setup-node`.
4. `setup-node` is given **no** `registry-url` (avoids the empty-`_authToken` bug — actions/setup-node#1551) and **no** cache (npm: don't cache in release builds).
5. A **"Verify OIDC / provenance prerequisites"** step fails fast with a clear message if Node/npm are too old — *before* the publish step.
6. Publish runs `npm publish --access public --provenance`; with the Trusted Publisher configured, npm exchanges the OIDC token and provenance is generated automatically.

## Fallback (only if OIDC ever breaks)

Set repo secret `NPM_TOKEN` = a **Classic → Automation** token (Granular/Publish → `EOTP`).
The workflow auto-uses it when non-empty; provenance still attaches via `--provenance` + `id-token: write`.

## Hardening (recommended)

npmjs.com → pi-packages → **Settings → Publishing access →** "Require two-factor
authentication and disallow tokens" → **Update**. Trusted publishing keeps working
(it uses OIDC, not a token); this only blocks traditional token auth.

## Failed release

```bash
gh run rerun <run-id> --failed          # if the tag commit already has the fix
# or, only if the version never reached npm:
git tag -f vX.Y.Z && git push origin vX.Y.Z --force
```

Never retag a version that already landed on npm — bump instead.

## History (reference)

- **Bootstrap (done):** the first publish can't use OIDC — npm's Trusted Publisher is attached to a package's *Settings* page, which only exists after the package is first published. `0.0.0` was published manually to create the package, then the Trusted Publisher was configured. Recorded as a general caveat for new packages in the parent `AGENTS.md`.
