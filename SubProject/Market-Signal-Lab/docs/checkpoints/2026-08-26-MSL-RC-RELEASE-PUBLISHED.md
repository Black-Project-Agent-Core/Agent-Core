# Market Signal Lab — RC GitHub Pre-Release Published

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Checkpoint:** 2026-08-26 (Asia/Jakarta)
**Branch:** `hardening/rc-stability-20260823`
**Verified product-source HEAD:** `498fedb0c11ee6c955306aca2199390af22cc0b8`
**Release tag:** `v0.3.0-alpha.6.5.3-preview.1`
**Release commit:** `0ce427406f5418aa7040e607893ec0cb788ae2f0`
**GitHub Release ID:** `377007837`
**GitHub Release state:** PUBLISHED / PRE-RELEASE / VERIFIED
**Published at:** `2026-08-26T09:15:45Z` (`2026-08-26 16:15:45 +07:00`)
**Release URL:** `https://github.com/rendevouz999/Market-Signal-Lab/releases/tag/v0.3.0-alpha.6.5.3-preview.1`

## Current truth

```text
RC Stability Hardening Wave 1              COMPLETE / VERIFIED
Exact elevated Setup release sign-off      COMPLETE / VERIFIED
Final release checksum manifest            COMPLETE / PUSHED
Annotated release tag                      COMPLETE / PUSHED
GitHub pre-release object                  COMPLETE / PUBLISHED
Five release assets                        COMPLETE / REMOTE DIGEST VERIFIED
C3.3 calibrated production intelligence    BLOCKED BY EMPIRICAL DATA / NOT AUTHORIZED
```

The release was published from the already signed-off candidate. No product rebuild, retag, version change, or implicit `main` merge was performed.

## Published assets and remote digests

GitHub reported all five assets as uploaded. Remote release digests match the local release artifacts used by the signed-off publication lane:

```text
sha256:cc4267431d2111d7f2b5f358987c0b411fac2138084b2c67e893c2cad63cac17  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe
sha256:154f52db59a55b6739aa12ae8fa55ac77b963bcdae3f12a39ca716cce30085e8  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Windows_x64.zip
sha256:f0b9d2f1827f51ccbff3b5f34584e1cf9273595757d31ca8c6854ea5d6fe4723  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Source.zip
sha256:5bbbac85e23d42f5b1ba1fe2cf07da09549fe93f8e8142ee0f8c979d35389835  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Browser_Companion.zip
sha256:710b6767becf85136f2c88dc439cf8590da025081ef00f55c68e36a908bfa25a  SHA256SUMS.txt
```

The first four payload hashes exactly match the canonical tracked manifest `releases/manifests/alpha6.5.3-preview.1-rc-final-sha256.txt`. `SHA256SUMS.txt` is the checksum sidecar itself and is additionally verified by its GitHub-provided asset digest above.

## Publication path

Publication used the prepared `RELEASE_NOTES.md` and the five previously verified assets under the ignored RC release-publication directory. The release was created draft-first, assets were uploaded, remote sizes and SHA-256 digests were verified, and only then was the object switched to `draft=false`, `prerelease=true`.

No GitHub Actions / CI execution was used for release verification or publication. Existing local/native verification remains authoritative.

Two local publisher-script defects were encountered and corrected only inside the ignored `dist` publication helper:

1. PowerShell URI interpolation around the upload query string required `${uploadBase}` bracing.
2. Windows PowerShell returned a top-level GitHub JSON array as a single array object, so release-asset enumeration required explicit flattening.

These publisher fixes did not alter tracked product source or signed-off release bytes.

## Non-public stale draft residue

The first failed publication attempt created GitHub draft release ID `377007543` with zero assets before the upload-URI defect stopped execution. It remains a non-public empty draft. It does not affect the published release object ID `377007837` or its five verified assets.

The empty draft was not deleted through an ad-hoc credential command because release deletion is a destructive operation and should use the Agent Core destructive-confirmation boundary when a native `github_release` mutation tool is available. Do not treat this draft residue as a release-candidate defect.

## C3 state remains unchanged

C3.0, C3.1, and C3.2 remain on their separate verified branches. C3.3 remains blocked because no real outcome-labelled calibration dataset and no explicitly approved `msl-calibration-artifact/1` with `productionEligible=true` exist.

Do not generate an approved artifact from synthetic data and do not relabel historical runtime ledgers as later-observed outcomes.

## Exact continuation target

```text
release v0.3.0-alpha.6.5.3-preview.1 = PUBLISHED / VERIFIED
-> preserve the exact tag, release object, and five verified assets
-> keep C3.3 blocked until real outcome-labelled history and an approved productionEligible msl-calibration-artifact/1 exist
-> collect future privacy-safe/versioned C3 evidence and later-observed outcomes
-> optional cleanup of empty draft 377007543 only through an explicitly confirmed destructive release-delete path
-> do not merge main implicitly
```
