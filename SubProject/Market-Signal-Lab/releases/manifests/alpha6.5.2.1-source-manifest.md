# Alpha 6.5.2.1 Source Manifest

Verified local release tree: `3475651`  
Tracked source files: **264**  
Tracked source size: approximately **1.8 MB** before ZIP compression.

Source archive:

```text
Market_Signal_Lab_v0.3_Alpha6.5.2.1_Live_Scan_Telemetry_Source.zip
SHA-256: b55b1fab30329c8aedcc6e066d62d424696b6c5967bfcafe46fb9267697f7bd7
```

The archive was extracted into a clean directory and passed:

```text
go test ./... -count=1
go vet ./...
node --check internal/web/assets/js/telemetry.js
```

Major tracked trees inside the verified source archive:

```text
cmd/market-signal-lab/
companion/browser-extension/
docs/superpowers/plans/
docs/superpowers/specs/
internal/analytics/
internal/app/
internal/autopilot/
internal/connectors/envato/
internal/consensus/
internal/domain/
internal/i18n/
internal/indexing/
internal/ingest/
internal/insights/
internal/quality/
internal/ranking/
internal/repository/
internal/sampling/
internal/security/
internal/segmentation/
internal/sources/
internal/storage/
internal/telemetry/
internal/temporal/
internal/universe/
internal/web/
scripts/
```

Security exclusion policy for GitHub sync:

- no Envato personal token;
- no Authorization headers;
- no cookies/browser storage;
- no `%LOCALAPPDATA%\\MarketSignalLab\\` database;
- no user's real local scan history;
- no raw account session.

The GitHub connector available in this ChatGPT runtime uses file/content APIs rather than a recursive authenticated `git push`; therefore key documentation and manifests are browseable on `main`, while the complete verified source snapshot is preserved in the downloadable Source ZIP supplied with the release. A future native Git push can materialize the 264 paths directly without changing their verified content.
