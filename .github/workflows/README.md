# CI/CD Pipeline — PrefetchChromeExtension

> Everything in this folder is the automated pipeline. Workflows live here, scripts live in `scripts/`.

## Files

| File                            | Trigger                             | Purpose                                 |
|---------------------------------|-------------------------------------|-----------------------------------------|
| `ci.yml`                        | push + PR + `workflow_call`         | manifest validation + JS syntax check   |
| `release.yml`                   | tag push `v*`                       | GitHub Release (extension zip)          |
| `nightly.yml`                   | CI success on `main`/`master`       | `nightly-YYYY-MM-DD` prerelease + GFS   |
| `_build.yml`                    | `workflow_call` (internal)          | Stamp manifest + zip extension          |
| `scripts/version.pl`            | invoked by workflows                | Reads `VERSION` at repo root            |
| `scripts/stamp-manifest.mjs`    | invoked by workflows                | Rewrites `manifest.json` version        |
| `scripts/update-changelog.mjs`  | invoked by workflows                | Bucketise commits into CHANGELOG.md     |
| `scripts/prune-nightlies.mjs`   | invoked by workflows                | 7+4+3 GFS retention of nightlies        |

## Version flow

1. `VERSION` file at repo root is the base (`MAJOR.MINOR.PATCH`).
2. `scripts/version.pl` computes `MAJOR.MINOR.PATCH.BUILD` where `BUILD = git rev-list --count HEAD`.
3. `scripts/stamp-manifest.mjs` rewrites `manifest.json`'s `"version"` field to that computed value. Chrome accepts 1-4 dot-separated integers.

Bumping `VERSION` (`1.0.0` → `1.1.0`) is the only manual step; the build number is automatic.

## Release artifacts

| Artifact                                            | Produced by          | Use                                |
|-----------------------------------------------------|----------------------|------------------------------------|
| `PrefetchChromeExtension-<version>.zip`             | release + nightly    | Chrome Web Store upload / "Load unpacked" |

No automatic Chrome Web Store upload (requires paid API setup); maintainers upload the zip manually.
