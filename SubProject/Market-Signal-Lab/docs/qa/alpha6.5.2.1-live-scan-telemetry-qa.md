# Alpha 6.5.2.1 — Live Scan Telemetry & Adaptive ETA QA

## Result

Release tree: `3475651`  
Version: `0.3.0-alpha.6.5.2.1`

Alpha 6.5.2.1 adds an auditable live runtime layer around the existing Market Autopilot without changing Trends & Insights formulas.

## Verified behavior

- `POST /api/autopilot/run` returns `202 Accepted` + `runId` and the server continues the scan in the background.
- Live runtime snapshot, SSE event stream, paginated run log, and runtime-history endpoints are available locally.
- Progress is `completed current-run work units / planned current-run work units`; previous product counts are never the denominator.
- ETA uses current work-unit rate, structurally comparable historical seconds/work-unit, request latency, explicit retry delay, and remaining work.
- With insufficient evidence, ETA is unavailable and the UI shows `Calibrating… / Mengkalibrasi…`.
- Live Market Mapping is visually separated from Last Completed Map.
- Main Recent Log is bounded to five entries; Full Run Log remains available.
- Runtime telemetry excludes token, Authorization header, cookies, browser storage, and raw API body.
- English and Indonesia remain release-gated.

## Verification

| Check | Result |
|---|---|
| `go test ./... -count=1` | PASS |
| `go vet ./...` | PASS |
| `go test -race ./internal/telemetry ./internal/web` | PASS |
| targeted new app run-manager/telemetry race tests | PASS |
| full legacy `internal/app` race suite | harness timeout after 8+ minutes; no failure output before timeout |
| JavaScript syntax checks | PASS |
| Consensus static contract | PASS |
| Responsive QA | 14/14 PASS |
| Source ZIP extracted + `go test ./...` | PASS |
| Source ZIP extracted + `go vet ./...` | PASS |
| Local runtime `/api/health` | PASS (`0.3.0-alpha.6.5.2.1`) |
| Windows artifact | PE32+ GUI x86-64 |

Responsive matrix was tested in English and Indonesia at 1920×1080, 1600×900, 1440×900, 1366×768, 1280×720, 1024×768, and 768×1024. There was no body-level horizontal overflow and no clipped primary controls.

## Visual reference

The approved concept places Live Market Mapping after Scope / Scan Mode / Schedule controls and before completed analytical results. The implementation preserves this hierarchy. The implementation uses 11 canonical audit stages instead of the simplified seven-stage concept. At 1366×768 the workspace preserves readable typography and may require normal vertical scrolling to view the full live panel rather than shrinking the UI.

## Remaining validation boundary

A real Envato-token scan cannot be executed in the build environment because the user's token must remain on the user's Windows machine. The connector and live telemetry contracts are tested against local HTTP simulators. The Windows binary is cross-built from the same verified source tree; final GUI click-through occurs on the user's Windows machine.
