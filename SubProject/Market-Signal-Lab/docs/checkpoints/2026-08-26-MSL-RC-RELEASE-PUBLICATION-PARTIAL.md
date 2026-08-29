# Market Signal Lab â€” RC Release Publication Partial Checkpoint

**Checkpoint:** 2026-08-26 (Asia/Jakarta)
**Branch:** `hardening/rc-stability-20260823`
**Branch head at publication preparation:** `0ce427406f5418aa7040e607893ec0cb788ae2f0`
**Verified product-source HEAD:** `498fedb0c11ee6c955306aca2199390af22cc0b8`
**Release tag:** `v0.3.0-alpha.6.5.3-preview.1`
**Release sign-off:** PASS / GO
**Git tag publication:** COMPLETE / VERIFIED
**GitHub Release object + asset publication:** PENDING / TOOLING BLOCKED

## Current truth

```text
RC Stability Hardening Wave 1             COMPLETE / VERIFIED
Exact elevated Setup release sign-off     COMPLETE / VERIFIED
Final release checksum manifest           COMPLETE / PUSHED
Annotated release tag                     COMPLETE / PUSHED
Release assets                            PREPARED / VERIFIED LOCALLY
GitHub Release object + asset upload       NOT PERFORMED
C3.3 calibrated production intelligence    BLOCKED BY EMPIRICAL DATA / NOT AUTHORIZED
```

The tag was created only after the final checksum manifest commit and points to `0ce427406f5418aa7040e607893ec0cb788ae2f0`. `main` was not merged or modified.

## Release assets prepared

```text
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Windows_x64.zip
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Source.zip
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Browser_Companion.zip
SHA256SUMS.txt
```

Final release SHA-256:

```text
CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe
154F52DB59A55B6739AA12AE8FA55AC77B963BCDAE3F12A39CA716CCE30085E8  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Windows_x64.zip
F0B9D2F1827F51CCBFF3B5F34584E1CF9273595757D31CA8C6854EA5D6FE4723  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Source.zip
5BBBAC85E23D42F5B1BA1FE2CF07DA09549FE93F8E8142EE0F8C979D35389835  Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Browser_Companion.zip
```

Canonical tracked manifest: `releases/manifests/alpha6.5.3-preview.1-rc-final-sha256.txt`.

## Packaging verification

- Setup release copy is byte-identical to the elevated-signoff candidate.
- Portable ZIP contains `version=0.3.0-alpha.6.5.3-preview.1` and `sourceHead=498fedb...`.
- Portable app SHA-256 matches `79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358`.
- Portable Rust worker SHA-256 matches `D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F`.
- Portable runtime smoke passed `healthy / rust-production / msl-analytics/2` with cleanup.
- Source ZIP contains exactly 542 tracked files from verified product-source `498fedb...`, with no `.git`, `dist`, `.env`, or credential-dump-like files.
- Browser Companion ZIP is byte-for-byte equivalent to the candidate staged companion tree.

## Publication tooling boundary

GitHub API authentication from the machine was verified against the private repository, and no release existed for the tag before publication attempts. The local publish workflow was designed draft-first so assets would be uploaded and verified before the pre-release became visible.

The current tool safety gate blocked execution of the GitHub Release write/upload script. This restriction must not be bypassed. Earlier API attempts failed before release creation due PowerShell JSON serialization/encoding and therefore did not constitute publication.

This is a tooling boundary, not a product or release-candidate defect. Do not rebuild, retag, or alter the signed-off candidate to work around it.

## Next exact action

```text
keep tag v0.3.0-alpha.6.5.3-preview.1 -> 0ce427406f5418aa7040e607893ec0cb788ae2f0
-> create a GitHub pre-release for that existing tag
-> use the prepared RELEASE_NOTES.md as the release body
-> upload the five prepared assets exactly as verified above
-> verify asset sizes/checksums and release state
-> only then mark formal GitHub Release publication COMPLETE
-> do not merge main implicitly
-> keep C3.3 blocked until real outcome-labelled calibration data and approved msl-calibration-artifact/1 exist
```

There is no approved C3.4 roadmap item.
