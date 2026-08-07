# Publishing `pi-packages`

`pi-packages` publishes to npm **from CI only** (tag-driven GitHub Actions +
npm Trusted Publisher / OIDC). Manual `npm publish` is blocked by
`package.json` → `prepublishOnly`.

This file is the per-package companion to the parent
[`AGENTS.md`](../../AGENTS.md) release rules. Read that first.

## Identity

| field | value |
|---|---|
| npm package | `pi-packages` |
| GitHub repo | `pungggi/pi-packages` |
| Workflow file | `release.yml` |
| Default branch | `main` |
| Visibility | **public** (`--access public --provenance`) |

## One-time setup — npm Trusted Publisher (OIDC, preferred)

On npmjs.com → create the package on first publish (the first tag does it), then
**Settings → Trusted Publisher** and add:

| field | value |
|---|---|
| Organization or user | `pungggi` |
| Repository | `pungggi/pi-packages` |
| Workflow filename | `release.yml` (exact, no path) |
| Environment | *(empty)* |

Leave `NPM_TOKEN` **unset**. The workflow auto-detects OIDC mode and avoids
writing an empty `_authToken=` (which would break trusted publishing).

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

## Fallback — Classic Automation token

Only if OIDC is unavailable: create a **Classic → Automation** token (bypasses
2FA; Granular/Publish tokens fail with `EOTP`) and add it as repo secret
`NPM_TOKEN`. The workflow uses it when non-empty.

## Failed release

```bash
gh run rerun <run-id> --failed          # if the tag commit already has the fix
# or, only if the version never reached npm:
git tag -f vX.Y.Z && git push origin vX.Y.Z --force
```

Never retag a version that already landed on npm — bump instead.
