# MSL Secure Envato Credential Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Envato company token a one-time researcher setup credential on Windows, automatically reusable across MSL restarts without ever entering Rust analytics, research history, exports, logs, or browser session state.

**Architecture:** Go owns one credential boundary. `ENVATO_TOKEN` remains an explicit process-scoped override; otherwise Go reads/writes a Generic Credential named `MarketSignalLab/Envato` through Windows Credential Manager. A small `internal/credentials` package owns the OS store, deterministic resolver, SHA-256 display fingerprint, and non-secret connection metadata. App services resolve the credential internally before authenticated Envato operations. Web/API contracts stop accepting tokens on scan/research/autopilot endpoints. The browser only submits plaintext during explicit configure/replace; it never caches the token. Rust `msl-analytics/2` remains completely secret-free.

**Tech Stack:** Go 1.22+; Windows Win32 Credential Manager APIs via Go standard library `syscall`/`unsafe` in Windows-only files; existing Envato HTTPS client; existing JSON file storage for non-secret metadata; vanilla JavaScript/HTML/CSS; Go tests + Windows PowerShell verification.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-18-msl-secure-credential-and-installation-design.md`.
- Baseline branch is `feature/analytics-v2-ipc`; do not write to `main`.
- Go remains application/control plane and secret owner.
- Rust receives normalized analytical data only and must never receive credentials.
- Persistent production secret store is Windows Credential Manager, not `.env`, config JSON, browser storage, or repository files.
- Shared Envato token is entered once per researcher Windows user on first setup.
- Same application/installer remains usable on any researcher PC; there is no machine-ID licensing or developer-PC binding.
- `ENVATO_TOKEN` is a runtime override only and must never silently overwrite the stored credential.
- Hashing is fingerprinting only. Authentication still uses the recoverable token from the OS store.
- No `Reveal API Key` route or UI.
- Invalid replacement must preserve the old credential.
- Missing/failed credential resolution fails closed. No synthetic/anonymous fallback.
- 401/403 auth semantics, 429 rate limit, network errors, provider 5xx, malformed responses, and local credential-store errors remain distinct.
- Do not automatically delete a stored credential after a provider failure.
- Plaintext may exist briefly in Go memory while a request is constructed; do not make claims that it is absent from RAM.
- No long-lived plaintext token in telemetry runtime state, JavaScript globals, persisted request models, error bodies, or analytics payloads.
- Existing history and rankings must not be rewritten by this feature.
- Existing Rust V2 runtime health/cutover behavior must not be weakened.
- Each task follows RED -> minimal GREEN -> regression -> commit.

## Canonical File Structure

### New credential boundary
- `internal/credentials/store.go` — platform-neutral `SecretStore` contract and constants.
- `internal/credentials/store_windows.go` — Windows Credential Manager Generic Credential implementation.
- `internal/credentials/store_unsupported.go` — explicit non-Windows unsupported implementation.
- `internal/credentials/store_windows_test.go` — opt-in native Windows store round-trip test.
- `internal/credentials/resolver.go` — environment-over-vault resolution and fingerprinting.
- `internal/credentials/resolver_test.go` — precedence/fingerprint/error tests.
- `internal/credentials/metadata.go` — non-secret `config/connection.json` atomic persistence.
- `internal/credentials/metadata_test.go` — metadata round-trip/atomicity/no-secret tests.
- `internal/credentials/manager.go` — persistent replace/remove transaction and metadata coordination.
- `internal/credentials/manager_test.go` — rollback and removal tests.

### App integration
- `internal/app/envato_credentials.go` — connection status, validation, replacement/removal, provider error classification.
- `internal/app/envato_credentials_test.go` — lifecycle/failure-model tests.
- `internal/app/service.go` — inject credential manager into `Service` constructors.
- `internal/app/market_scanner.go` / tests — remove token from scan request and resolve inside Go service.
- `internal/app/universe_service.go` / tests — remove token from observation request and resolve internally.
- `internal/app/autopilot_service.go` / tests — public Autopilot API resolves credential; private run receives request-scoped plaintext only.
- `internal/app/autopilot_run_manager.go` / tests — no token argument and no long-lived secret cache.
- `internal/telemetry/recorder.go` / tests — remove `activeRuntime.secret` and `SetSecret`.
- `internal/domain/universe.go` — remove `MarketScanRequest.Token`.
- `internal/connectors/envato/client_test.go` — canary secret redaction regression.

### Web/UI
- `internal/web/envato_connection_handlers.go` — central credential status/configure/test/remove API.
- `internal/web/envato_connection_handlers_test.go` — response contracts and safe errors.
- `internal/web/server.go` — register connection routes; remove token fields from direct Envato endpoints.
- `internal/web/scanner_handlers.go` — scanner has no token request body.
- `internal/web/autopilot_handlers.go` — Autopilot run body has mode only.
- `internal/web/universe_handlers.go` — observed research has no token input.
- `internal/web/envato_errors.go` — classify safe app errors without receiving raw token.
- `internal/web/assets/js/app.js` — remove `sessionEnvatoToken`; add connection-state client.
- `internal/web/templates/index.html` — connection status/settings + first-run dialog.
- `internal/web/autopilot_ui_test.go` — secure credential UI contracts.
- `internal/web/i18n_contract_test.go` — localization contract remains complete.
- `internal/i18n/locales/en.json`, `internal/i18n/locales/id.json` — first-setup/connection copy.

### CLI / repository safety / verification
- `cmd/market-signal-lab/main.go`, `main_test.go` — headless command uses same resolver; `--token-env` remains override selector.
- `.gitignore` — ignore `.env` and `.env.*`, allow `.env.example`.
- `.env.example` — only `ENVATO_TOKEN=`.
- `internal/app/secret_leakage_test.go` — canary scan across files, HTTP responses, errors, and analytics capture.
- `docs/qa/secure-envato-credential-qa.md` — verification evidence template/results after gates pass.
- `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`, `docs/checkpoints/CONTINUE_MSL.md` — update only after verified completion.

---

### Task 1: Build the Platform-Neutral Credential Resolver, Fingerprint, and Metadata Store

**Files:**
- Create: `internal/credentials/store.go`
- Create: `internal/credentials/resolver.go`
- Create: `internal/credentials/resolver_test.go`
- Create: `internal/credentials/metadata.go`
- Create: `internal/credentials/metadata_test.go`

**Interfaces:**

```go
package credentials

import "errors"

const (
    DefaultTarget  = "MarketSignalLab/Envato"
    DefaultEnvName = "ENVATO_TOKEN"
)

var (
    ErrNotConfigured      = errors.New("credential not configured")
    ErrUnsupportedPlatform = errors.New("credential store unavailable on this platform")
)

type SecretStore interface {
    Read(target string) (secret string, found bool, err error)
    Write(target, secret string) error
    Delete(target string) error
}
```

```go
type Source string

const (
    SourceEnvironment       Source = "environment"
    SourceCredentialManager Source = "credential_manager"
)

type Resolved struct {
    Token       string
    Source      Source
    Fingerprint string
}

type Resolver struct {
    store   SecretStore
    getenv  func(string) string
    envName string
    target  string
}

func NewResolver(store SecretStore, getenv func(string) string, envName, target string) *Resolver
func (r *Resolver) Resolve() (Resolved, error)
func Fingerprint(token string) string
```

Fingerprint implementation is deterministic and never uses a literal token substring:

```go
func Fingerprint(token string) string {
    sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
    raw := strings.ToUpper(hex.EncodeToString(sum[:4]))
    return raw[:4] + "-" + raw[4:8]
}
```

Metadata contract:

```go
type Metadata struct {
    Provider              string `json:"provider"`
    Configured            bool   `json:"configured"`
    CredentialFingerprint string `json:"credentialFingerprint,omitempty"`
    LastVerifiedAt        string `json:"lastVerifiedAt,omitempty"`
    LastStatus            string `json:"lastStatus"`
}
```

Metadata path is exactly `<dataRoot>/config/connection.json`; write using sibling temp file + `os.Rename`. Metadata is never authoritative for secret existence.

- [ ] Write `resolver_test.go` with a fake `SecretStore`: env override wins; empty env falls through to store; missing store returns `ErrNotConfigured`; store error is propagated; fingerprint is stable and contains no token substring.
- [ ] Run `go test ./internal/credentials -run 'TestResolver|TestFingerprint' -count=1`; verify RED because package/implementation does not exist.
- [ ] Implement `store.go` and `resolver.go` exactly around the interfaces above.
- [ ] Run the focused resolver tests; verify GREEN.
- [ ] Write metadata tests: absent file returns zero metadata without inventing configured=true; write/read round trip; corrupt JSON returns error; generated file does not contain a supplied canary token because caller passes metadata only.
- [ ] Run `go test ./internal/credentials -run 'TestMetadata' -count=1`; verify RED.
- [ ] Implement atomic `MetadataStore` in `metadata.go`.
- [ ] Run `go test ./internal/credentials -count=1`; verify GREEN.
- [ ] Run `gofmt -w internal/credentials/*.go` and `git diff --check`.
- [ ] Commit: `feat: add credential resolver and metadata boundary`.

---

### Task 2: Implement Windows Credential Manager Generic Credential Storage

**Files:**
- Create: `internal/credentials/store_windows.go`
- Create: `internal/credentials/store_unsupported.go`
- Create: `internal/credentials/store_windows_test.go`

**Windows implementation contract:**
- Build tag `//go:build windows`.
- Use `Advapi32.dll` procedures `CredReadW`, `CredWriteW`, `CredDeleteW`, and `CredFree` through `syscall.NewLazyDLL`.
- Credential `Type = 1` (`CRED_TYPE_GENERIC`).
- Credential `Persist = 2` (`CRED_PERSIST_LOCAL_MACHINE`): persistence for the same Windows user on that workstation; this is not app/machine licensing.
- Store UTF-8 token bytes as the credential blob.
- Reject empty target, empty secret, embedded-NUL target, and blob length above 2560 bytes before calling Win32.
- `ERROR_NOT_FOUND` on read means `(found=false, err=nil)`; on delete it is an idempotent success.
- Every Win32 error message names the operation/target but never the secret.
- Always call `CredFree` on successful `CredReadW`.
- `runtime.KeepAlive(blob)` after `CredWriteW` so the Go backing array remains alive for the native call.

Native struct layout in the Windows-only file:

```go
type nativeCredential struct {
    Flags              uint32
    Type               uint32
    TargetName         *uint16
    Comment            *uint16
    LastWritten        syscall.Filetime
    CredentialBlobSize uint32
    CredentialBlob     *byte
    Persist            uint32
    AttributeCount     uint32
    Attributes         uintptr
    TargetAlias        *uint16
    UserName           *uint16
}
```

Non-Windows implementation returns `ErrUnsupportedPlatform` from read/write/delete; resolver still succeeds from `ENVATO_TOKEN` before attempting the store.

- [ ] Write a Windows-only integration test gated by `MSL_TEST_WINDOWS_CREDENTIAL_MANAGER=1`. Use a unique target `MarketSignalLab/Test/<timestamp>`, write canary, read exact canary, delete, verify missing; `defer Delete` immediately after target creation.
- [ ] Add platform-neutral test proving a resolver with a store error still succeeds when environment override is present.
- [ ] Run Linux/current-host unit tests and a Windows cross-compile check: `GOOS=windows GOARCH=amd64 go test ./internal/credentials -c -o /tmp/msl-credentials.test.exe`; verify RED first.
- [ ] Implement Windows and unsupported stores.
- [ ] Re-run `go test ./internal/credentials -count=1` and Windows cross-compile; verify GREEN.
- [ ] On a real Windows workstation, run `$env:MSL_TEST_WINDOWS_CREDENTIAL_MANAGER='1'; go test ./internal/credentials -run TestWindowsCredentialManager -count=1 -v`; verify PASS and no leftover test credential.
- [ ] Commit: `feat: add Windows Credential Manager store`.

---

### Task 3: Add Transactional Persistent Credential Management and App-Level Connection State

**Files:**
- Create: `internal/credentials/manager.go`
- Create: `internal/credentials/manager_test.go`
- Create: `internal/app/envato_credentials.go`
- Create: `internal/app/envato_credentials_test.go`
- Modify: `internal/app/service.go`

**Credential manager API:**

```go
type Manager struct {
    resolver *Resolver
    store    SecretStore
    metadata *MetadataStore
    target   string
}

func NewManager(store SecretStore, dataRoot string, getenv func(string) string, envName string) *Manager
func NewDefaultManager(dataRoot, envName string) *Manager
func (m *Manager) Resolve() (Resolved, error)
func (m *Manager) ReadPersistent() (Resolved, bool, error)
func (m *Manager) ReplacePersistent(token string, metadata Metadata) (Resolved, error)
func (m *Manager) RemovePersistent() error
func (m *Manager) Metadata() (Metadata, error)
```

`ReplacePersistent` transaction:
1. read old secret/found and old metadata;
2. write new secret;
3. write new metadata;
4. if metadata write fails, restore old secret or delete new secret if none existed, then restore old metadata;
5. return an error that contains no secret.

**App connection state:**

```go
type EnvatoConnectionState string

const (
    EnvatoConnectionNotConfigured        EnvatoConnectionState = "not_configured"
    EnvatoConnectionConfigured           EnvatoConnectionState = "configured"
    EnvatoConnectionConnected            EnvatoConnectionState = "connected"
    EnvatoConnectionNeedsAttention       EnvatoConnectionState = "needs_attention"
    EnvatoConnectionRateLimited          EnvatoConnectionState = "rate_limited"
    EnvatoConnectionNetworkUnavailable   EnvatoConnectionState = "network_unavailable"
    EnvatoConnectionProviderError        EnvatoConnectionState = "provider_error"
    EnvatoConnectionProviderResponseError EnvatoConnectionState = "provider_response_error"
    EnvatoConnectionCredentialStoreError EnvatoConnectionState = "credential_store_error"
)

type EnvatoConnectionStatus struct {
    Provider              string                `json:"provider"`
    Configured            bool                  `json:"configured"`
    EffectiveSource       string                `json:"effectiveSource,omitempty"`
    CredentialFingerprint string                `json:"credentialFingerprint,omitempty"`
    Status                EnvatoConnectionState `json:"status"`
    LastVerifiedAt        string                `json:"lastVerifiedAt,omitempty"`
}
```

App methods:

```go
func (s *Service) EnvatoConnectionStatus() EnvatoConnectionStatus
func (s *Service) SaveEnvatoCredential(ctx context.Context, token string) (EnvatoConnectionStatus, error)
func (s *Service) TestEnvatoConnection(ctx context.Context) (EnvatoConnectionStatus, error)
func (s *Service) RemoveEnvatoCredential() (EnvatoConnectionStatus, error)
func (s *Service) resolveEnvatoCredential() (credentials.Resolved, error)
```

Failure classifier maps `TokenPermissionError` and authenticated 401/403 semantics to `needs_attention`, 429 to `rate_limited`, `net.Error`/deadline to `network_unavailable`, 5xx to `provider_error`, malformed/unexpected provider errors to `provider_response_error`, and vault failures to `credential_store_error`. Returned UI error messages are fixed/safe messages; do not serialize wrapped provider errors containing request material.

- [ ] Write manager rollback tests including injected metadata-write failure; prove old secret remains after failed replacement.
- [ ] Run `go test ./internal/credentials -run TestManager -count=1`; verify RED, implement `manager.go`, then GREEN.
- [ ] Extend `Service` with `credentials *credentials.Manager`; normal constructors create `NewDefaultManager(store.Root(), credentials.DefaultEnvName)` while a test constructor accepts an injected manager without changing the Rust runtime ownership.
- [ ] Write `envato_credentials_test.go` against `httptest.Server`: valid token validates then persists; invalid token is never persisted; valid replacement changes fingerprint; invalid replacement keeps old token; remove deletes vault metadata but does not touch seeded history; environment override is effective without persisting it.
- [ ] Add table-driven provider failure classification tests for 401, 403 permission error, 429, 500, timeout, malformed provider response, and store read error.
- [ ] Run `go test ./internal/app -run 'TestEnvatoCredential|TestEnvatoConnection' -count=1`; verify RED then implement `envato_credentials.go` and constructor wiring.
- [ ] Re-run focused app tests; verify GREEN.
- [ ] Run `go test ./internal/credentials ./internal/app -count=1` and `git diff --check`.
- [ ] Commit: `feat: add persistent Envato connection lifecycle`.

---

### Task 4: Remove Token Fields from Domain/App APIs and Eliminate the Telemetry Secret Cache

**Files:**
- Modify: `internal/domain/universe.go`
- Modify: `internal/app/market_scanner.go`, `internal/app/market_scanner_test.go`
- Modify: `internal/app/universe_service.go`, `internal/app/universe_service_test.go`
- Modify: `internal/app/service.go`, `internal/app/service_test.go`
- Modify: `internal/app/autopilot_service.go` and relevant tests
- Modify: `internal/app/autopilot_run_manager.go`, `internal/app/autopilot_run_manager_test.go`
- Modify: `internal/telemetry/recorder.go` and tests

**Required contract changes:**

```go
type MarketScanRequest struct {
    Catalog          CatalogPathInput `json:"catalog"`
    Keywords         []string         `json:"keywords"`
    Site             string           `json:"site"`
    Category         string           `json:"category,omitempty"`
    SortBy           string           `json:"sortBy,omitempty"`
    MaxPages         int              `json:"maxPages"`
    PageSize         int              `json:"pageSize"`
    RequestBudget    int              `json:"requestBudget"`
    AutoBuildRanking bool             `json:"autoBuildRanking,omitempty"`
}
```

```go
type ObserveEnvatoQueryRequest struct {
    SessionID string `json:"sessionId"`
    QueryID   string `json:"queryId"`
}
```

Public methods become token-free:

```go
RunMarketAutopilot(ctx context.Context, mode domain.MarketMapMode)
StartMarketAutopilot(ctx context.Context, mode domain.MarketMapMode)
ResearchEnvatoSearch(ctx context.Context, identityID string, req envatoconn.SearchRequest)
ResearchEnvatoTotalItems(ctx context.Context, identityID string)
```

`runMarketAutopilotWithID(ctx, token, mode, runID)` may remain private because it is the bounded request execution lifetime. `AutopilotRunManager.Start(mode)` resolves once, then passes only its goroutine-local token into that private function.

Telemetry change is mandatory:
- delete `activeRuntime.secret`;
- delete `Recorder.SetSecret`;
- delete redaction from generic `Recorder.Emit`;
- every authenticated call site performs `security.RedactSecret(message, resolved.Token)` before handing diagnostic text to telemetry/history.

- [ ] Add tests that JSON-marshalling `MarketScanRequest` and `ObserveEnvatoQueryRequest` cannot produce a `token` key.
- [ ] Update scanner tests to inject a fake credential manager and verify Envato still receives the expected Bearer header.
- [ ] Update universe observation tests similarly.
- [ ] Update direct Envato research tests so the service resolves internally.
- [ ] Update Autopilot run-manager test to call `StartMarketAutopilot(ctx, mode)` and prove it still returns before scan completion.
- [ ] Add telemetry test that `activeRuntime`/public API no longer accepts or stores a secret and that pre-redacted detail persists unchanged.
- [ ] Run focused packages before code change to capture RED compile failures after test contract updates.
- [ ] Implement minimal token-field/signature removals and resolver calls. Keep token as a local variable only around connector calls; set local references to empty where practical after terminal completion.
- [ ] Run `go test ./internal/app ./internal/telemetry -count=1`; verify GREEN.
- [ ] Run `go test ./internal/domain ./internal/app ./internal/telemetry -count=1` and `git diff --check`.
- [ ] Commit: `refactor: centralize Envato credential resolution`.

---

### Task 5: Add the Central Envato Connection HTTP API and Remove Tokens from Other HTTP Contracts

**Files:**
- Create: `internal/web/envato_connection_handlers.go`
- Create: `internal/web/envato_connection_handlers_test.go`
- Modify: `internal/web/server.go`, `internal/web/server_test.go`
- Modify: `internal/web/scanner_handlers.go`
- Modify: `internal/web/autopilot_handlers.go`
- Modify: `internal/web/universe_handlers.go`
- Modify: `internal/web/envato_errors.go` and tests

**Routes:**

```text
GET    /api/connections/envato
POST   /api/connections/envato          body: {"token":"..."}
POST   /api/connections/envato/test     body: {}
DELETE /api/connections/envato
```

Rules:
- GET response contains status/fingerprint/source only; never token.
- POST configure/replace validates before persistence. Empty token -> 400.
- POST test resolves effective credential and validates it without modifying persistent credential.
- DELETE removes persistent credential; an active `ENVATO_TOKEN` override remains effective and response must say so rather than pretending no credential exists.
- `/api/autopilot/run` request has only `mode`/`scanMode`.
- `/api/scanner/envato/run` uses token-free `MarketScanRequest`.
- `/api/research/envato/observe`, `/api/envato/search`, `/api/envato/total-items` contain no token fields.
- Keep `decode(...).DisallowUnknownFields()`: old clients sending `token` must fail loudly rather than silently keep an obsolete credential path.

- [ ] Write handler tests for fresh `not_configured`, valid configure, invalid configure, test, replacement, delete, and runtime override.
- [ ] In every response body assert the canary token is absent and there is no JSON field named `token`.
- [ ] Add tests that sending legacy `{ "token": "x" }` to Autopilot/scanner/research contracts returns 400 unknown-field rather than accepting it.
- [ ] Run `go test ./internal/web -run 'TestEnvatoConnection|Test.*RejectsLegacyToken' -count=1`; verify RED.
- [ ] Implement handlers/routes and strip token request fields from existing handlers.
- [ ] Refactor `writeEnvatoConnectorError` to accept safe app errors only; it must not take a raw token parameter.
- [ ] Run focused web tests; verify GREEN.
- [ ] Run `go test ./internal/web ./internal/app -count=1` and `git diff --check`.
- [ ] Commit: `feat: add secure Envato connection API`.

---

### Task 6: Replace Browser Session Token State with First-Run Connection UX

**Files:**
- Modify: `internal/web/assets/js/app.js`
- Modify: `internal/web/templates/index.html`
- Modify: `internal/web/autopilot_ui_test.go`
- Modify: `internal/web/i18n_contract_test.go`
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`

**JavaScript state:**

```js
let envatoConnectionReady=false;
let envatoConnectionStatus=null;
```

Delete completely:

```js
let sessionEnvatoToken='';
captureSourceToken()
clearSourceToken()
```

Add functions:

```js
async function loadEnvatoConnectionStatus()
async function saveEnvatoCredentialFromInput(inputId)
async function testEnvatoConnection()
async function removeEnvatoCredential()
function renderEnvatoConnection(status)
function updateEnvatoDependentActions()
```

Raw token handling rule in `saveEnvatoCredentialFromInput`: read password input -> submit one POST -> immediately clear input in `finally`; do not assign it to any global, localStorage, sessionStorage, URL, log, or DOM text.

HTML behavior:
- Settings shows status, source, fingerprint, last verified; hidden password input only for connect/replace.
- Buttons: `Test Connection`, `Replace API Key`/`Connect Envato`, `Remove Credential`.
- No reveal button.
- Add `<dialog id="envatoSetupDialog">` with a password input and `Verify & Continue`.
- On initial load, if status is `not_configured`, open setup dialog and disable `Map Market Now` plus other authenticated Envato actions.
- If effective source is `environment`, treat connection as available; do not force setup dialog and label it as runtime override.
- Autopilot scheduling note must no longer claim the dashboard never stores the token because of session memory; say the headless command uses the configured credential or explicit environment override.

- [ ] Rewrite `autopilot_ui_test.go` first: assert `sessionEnvatoToken`/`sourceToken` are absent; setup dialog/status/actions are present; no localStorage/sessionStorage secret key; Autopilot/scanner/direct Envato request builders contain no `token:` field.
- [ ] Add i18n contract expectations for all new connection/first-run strings in English and Indonesian.
- [ ] Run `go test ./internal/web -run 'Test.*Credential|TestSource|TestMarketAutopilot|TestAllHTMLTranslation' -count=1`; verify RED.
- [ ] Implement HTML/JS/locales minimally to satisfy the new contract while retaining the existing Autopilot live tracker and layout.
- [ ] Ensure `initializeLocalization().then(...)` loads connection status before enabling authenticated actions.
- [ ] Run all `internal/web` tests; verify GREEN.
- [ ] Run `git grep -n -E 'sessionEnvatoToken|sourceToken|scannerToken' -- internal/web`; expected no obsolete secret state/input references.
- [ ] Commit: `feat: add one-time Envato credential setup UI`.

---

### Task 7: Preserve Headless Environment Overrides and Add Repository `.env` Protection

**Files:**
- Modify: `cmd/market-signal-lab/main.go`
- Modify: `cmd/market-signal-lab/main_test.go`
- Modify: `.gitignore`
- Create: `.env.example`

Headless behavior:
- `market-map --token-env NAME` sets which process environment variable the resolver consults first for that process.
- Do not read the env var in `main.go` and pass a literal token into `RunMarketAutopilot` anymore.
- Construct the service credential manager with the selected env name, then call token-free `RunMarketAutopilot(ctx, mode)`.
- If the selected env var is empty but a persistent Windows credential exists, headless mode may use the persistent credential.
- On non-Windows with no environment override, return a safe configuration error because the OS credential store is unavailable.
- `--token <literal>` remains rejected.

Repository rules:

```gitignore
.env
.env.*
!.env.example
```

`.env.example` contains exactly:

```text
ENVATO_TOKEN=
```

- [ ] Update CLI tests: env override works through resolver; custom `--token-env` works; missing env on a fake/injected vault can fall through to stored credential; literal token flag rejected.
- [ ] Run `go test ./cmd/market-signal-lab -count=1`; verify RED after contract changes.
- [ ] Implement credential-manager construction with configurable env name; do not add `.env` auto-loading.
- [ ] Add `.gitignore` and `.env.example`.
- [ ] Run `go test ./cmd/market-signal-lab -count=1`; verify GREEN.
- [ ] Run `git check-ignore .env .env.local`; both ignored. Run `git check-ignore .env.example`; expected not ignored.
- [ ] Commit: `chore: secure Envato environment override workflow`.

---

### Task 8: Add End-to-End Secret Leakage Regression Gates

**Files:**
- Create: `internal/app/secret_leakage_test.go`
- Modify: `internal/connectors/envato/client_test.go`
- Modify tests under `internal/web` and `internal/analyticsengine` only if required for capture helpers; do not change Rust schema.

**Canary:**

```text
MSL_TEST_SECRET_DO_NOT_LEAK_7F83C91A5E2D
```

Test flow:
1. fake credential store contains canary;
2. fake Envato server checks exact `Authorization: Bearer <canary>` and deliberately returns both success and error bodies containing the canary;
3. execute connection test, scanner/observation path, and one Autopilot path with fake analytics engine;
4. gather every regular file below temporary MSL data root (`config`, `history`, `cache`, `exports`, `logs`);
5. marshal export bundle, captured HTTP responses, formatted public errors, telemetry events, and captured analytics-engine request structures/encoded v2 bytes;
6. assert `bytes.Contains(..., canary) == false` everywhere except the fake credential store and the fake Envato server's received Authorization header.

Also add connector unit test where upstream error body echoes the token; `HTTPStatusError.Error()` must contain `[REDACTED]` and never the canary.

- [ ] Write leakage tests first and prove RED against any remaining token-bearing request contract/global telemetry behavior.
- [ ] Make only the minimal redaction/lifetime fixes necessary; do not weaken diagnostic usefulness by removing status/path/error class.
- [ ] Run `go test ./internal/connectors/envato ./internal/app ./internal/web ./internal/analyticsengine -count=1`.
- [ ] Run `go test -race ./internal/credentials ./internal/app ./internal/web ./internal/telemetry -count=1`.
- [ ] Run `go vet ./...` and `git diff --check`.
- [ ] Run repository secret-contract scan: `git grep -n -E 'Token[[:space:]]+string[[:space:]]+`json:"token|sessionEnvatoToken|SetSecret\(' -- ':!docs/**'`; expected no production secret transport/cache hits.
- [ ] Commit: `test: gate Envato secret leakage`.

---

### Task 9: Native Windows Credential Restart Smoke and Evidence

**Files:**
- Create after PASS: `docs/qa/secure-envato-credential-qa.md`
- Modify after PASS: `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`
- Modify after PASS: `docs/checkpoints/CONTINUE_MSL.md`

**Automated Windows gate before real token:**

```powershell
$env:MSL_TEST_WINDOWS_CREDENTIAL_MANAGER='1'
go test ./internal/credentials ./internal/app ./internal/web -count=1 -v
go test -race ./internal/credentials ./internal/app -count=1
go vet ./...
git diff --check
```

Build the same packaged pair convention already used by Alpha 6.5.3:

```powershell
cargo build --release --manifest-path .\engines\rust\Cargo.toml
go build -trimpath -ldflags "-s -w -H=windowsgui" -o ".\dist\credential-smoke\Market Signal Lab.exe" .\cmd\market-signal-lab
Copy-Item .\engines\rust\target\release\msl-analytics-rust.exe .\dist\credential-smoke\engines\rust\msl-analytics-rust.exe -Force
```

Use an isolated Windows user data root for the first native credential smoke. Then perform the real-company-token validation manually without putting the token in shell history/chat/logs:

```text
1. Launch MSL.
2. First-run dialog appears.
3. Paste real Envato token once in the local UI.
4. Verify & Continue succeeds.
5. Run Quick Map Market Now; it completes with real observed data.
6. Close MSL completely.
7. Relaunch the same executable/data root.
8. Confirm no token prompt appears and connection status is resolved from Credential Manager.
9. Run Quick Map Market Now again without re-entering token.
10. Confirm Rust production health still reports msl-analytics/2.
```

Evidence may record timestamps, source commit, application/worker SHA-256, connection source=`credential_manager`, fingerprint, run IDs/counts/status, and health result. It must never record the token or Authorization header.

- [ ] Complete automated Windows gates.
- [ ] Complete real first-entry -> restart -> no-reentry Quick scan gate.
- [ ] Search the chosen test data root for the exact token locally using a private command that prints only a match count, not matching lines. Expected count=0 outside Windows Credential Manager.
- [ ] Confirm existing history data remains readable when the new build is run against a copied pre-feature data root.
- [ ] Only after all PASS, write `docs/qa/secure-envato-credential-qa.md` with factual evidence.
- [ ] Update checkpoints: live Envato baseline accepted; secure credential runtime VERIFIED; Windows installer lifecycle plan is next; Phase C remains blocked until installer lifecycle gate is complete.
- [ ] Run docs `git diff --check`.
- [ ] Commit: `docs: verify secure Envato credential runtime`.

## Completion Gate

This plan is COMPLETE/VERIFIED only when all are true:

```text
[ ] researcher enters real token once on fresh Windows setup
[ ] restart requires no token re-entry
[ ] ENVATO_TOKEN override remains process-scoped and non-persistent
[ ] invalid replacement preserves prior valid credential
[ ] no token field remains in scan/research/autopilot public JSON contracts
[ ] browser holds no global/session/local storage token
[ ] telemetry holds no long-lived plaintext token cache
[ ] history/cache/config/exports/logs contain zero canary occurrences
[ ] HTTP responses/public errors contain zero canary occurrences
[ ] analytics IPC contains zero canary occurrences
[ ] Rust production worker remains healthy on msl-analytics/2
[ ] existing market history remains intact
[ ] full Go/race/vet/diff gates pass
[ ] factual Windows + real Envato restart evidence is recorded without secret material
```

Do not begin the Windows installer lifecycle implementation until this runtime credential plan is verified, because the installer verification must prove that this working credential survives upgrade/reinstall rather than testing two unfinished systems simultaneously.
