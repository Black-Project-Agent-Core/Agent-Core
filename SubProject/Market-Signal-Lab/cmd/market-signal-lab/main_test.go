package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

type cliSecretStore struct{ secret string }
func (s *cliSecretStore) Read(string) (string, bool, error) { return s.secret, s.secret != "", nil }
func (s *cliSecretStore) Write(_ string, secret string) error { s.secret = secret; return nil }
func (s *cliSecretStore) Delete(string) error { s.secret = ""; return nil }

func TestParseArgsDefaultsToServeAndSupportsOverrides(t *testing.T) {
	c, err := parseArgs([]string{})
	if err != nil { t.Fatal(err) }
	if c.Command != "serve" || c.Port != 17771 || c.NoOpen { t.Fatalf("defaults=%+v", c) }
	c, err = parseArgs([]string{"serve", "--port", "18888", "--data-dir", "C:/x", "--no-open"})
	if err != nil { t.Fatal(err) }
	if c.Port != 18888 || c.DataDir != "C:/x" || !c.NoOpen { t.Fatalf("override=%+v", c) }
}

func TestParseArgsSupportsVersion(t *testing.T) {
	c, err := parseArgs([]string{"version"})
	if err != nil { t.Fatal(err) }
	if c.Command != "version" { t.Fatalf("%+v", c) }
}

func TestParseArgsRejectsRemovedDemoCommands(t *testing.T) {
	for _, command := range []string{"demo", "ranking-demo", "purge-legacy-demo"} {
		if _, err := parseArgs([]string{command}); err == nil { t.Fatalf("%s command must be removed", command) }
	}
}

func TestParseArgsSupportsHeadlessMarketMapWithoutLiteralToken(t *testing.T) {
	c, err := parseArgs([]string{"market-map", "--token-env", "MY_ENVATO_TOKEN", "--mode", "deep", "--data-dir", "D:/market-data", "--no-open"})
	if err != nil { t.Fatal(err) }
	if c.Command != "market-map" || c.TokenEnv != "MY_ENVATO_TOKEN" || c.Mode != "deep" || c.DataDir != "D:/market-data" || !c.NoOpen { t.Fatalf("config=%+v", c) }
	if _, err := parseArgs([]string{"market-map", "--token", "secret"}); err == nil { t.Fatal("literal token flag must be rejected") }
}

func fakeEnvatoServer(t *testing.T, wantToken string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+wantToken { t.Fatalf("authorization=%q", r.Header.Get("Authorization")) }
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":29120543}}`))
		case "/v1/discovery/search/search/item":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":1,"name":"Probe"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestNewServiceForRuntimeUsesSelectedEnvironmentOverride(t *testing.T) {
	api := fakeEnvatoServer(t, "custom-env-secret")
	defer api.Close()
	t.Setenv("MARKET_SIGNAL_LAB_ENVATO_BASE_URL", api.URL)
	t.Setenv("CUSTOM_ENVATO_TOKEN", "custom-env-secret")
	oldFactory := runtimeCredentialManagerFactory
	runtimeCredentialManagerFactory = func(dataRoot, envName string) *credentialspkg.Manager {
		return credentialspkg.NewManager(&cliSecretStore{}, dataRoot, os.Getenv, envName)
	}
	defer func(){ runtimeCredentialManagerFactory = oldFactory }()
	st, err := storage.Open(t.TempDir()); if err != nil { t.Fatal(err) }
	status, err := newServiceForRuntime(st, "CUSTOM_ENVATO_TOKEN").TestEnvatoConnection(context.Background())
	if err != nil { t.Fatal(err) }
	if status.EffectiveSource != string(credentialspkg.SourceEnvironment) || status.Status != "connected" { t.Fatalf("status=%+v", status) }
}

func TestNewServiceForRuntimeFallsThroughToPersistentCredential(t *testing.T) {
	api := fakeEnvatoServer(t, "stored-secret")
	defer api.Close()
	t.Setenv("MARKET_SIGNAL_LAB_ENVATO_BASE_URL", api.URL)
	t.Setenv("EMPTY_ENVATO_TOKEN", "")
	oldFactory := runtimeCredentialManagerFactory
	runtimeCredentialManagerFactory = func(dataRoot, envName string) *credentialspkg.Manager {
		return credentialspkg.NewManager(&cliSecretStore{secret:"stored-secret"}, dataRoot, os.Getenv, envName)
	}
	defer func(){ runtimeCredentialManagerFactory = oldFactory }()
	st, err := storage.Open(t.TempDir()); if err != nil { t.Fatal(err) }
	status, err := newServiceForRuntime(st, "EMPTY_ENVATO_TOKEN").TestEnvatoConnection(context.Background())
	if err != nil { t.Fatal(err) }
	if status.EffectiveSource != string(credentialspkg.SourceCredentialManager) || status.Status != "connected" { t.Fatalf("status=%+v", status) }
}

func TestServeReportsExistingMarketSignalLabVersionOnPortConflict(t *testing.T) {
	existing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" { http.NotFound(w, r); return }
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"app":"Market Signal Lab","version":"0.3.0-alpha.5"}`))
	}))
	defer existing.Close()
	u, err := url.Parse(existing.URL); if err != nil { t.Fatal(err) }
	_, portText, err := net.SplitHostPort(u.Host); if err != nil { t.Fatal(err) }
	port, err := strconv.Atoi(portText); if err != nil { t.Fatal(err) }
	var stdout, stderr strings.Builder
	code := run([]string{"serve", "--port", strconv.Itoa(port), "--data-dir", t.TempDir(), "--no-open"}, &stdout, &stderr)
	if code != 1 { t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String()) }
	message := strings.ToLower(stderr.String())
	if !strings.Contains(message, "0.3.0-alpha.5") || !strings.Contains(message, "close") || !strings.Contains(message, "older") { t.Fatalf("stderr=%q", stderr.String()) }
}

func TestVersionIsAlpha653Preview(t *testing.T) {
	if appVersion != "0.3.0-alpha.6.5.3-preview.1" { t.Fatalf("version=%q", appVersion) }
}

func TestParseArgsSupportsCaptureHelperPath(t *testing.T) {
	c, err := parseArgs([]string{"capture-helper-path"}); if err != nil { t.Fatal(err) }
	if c.Command != "capture-helper-path" { t.Fatalf("config=%+v", c) }
}

func TestServePortConflictLeavesInterruptedRunUnreconciled(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	seeded, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	interrupted := domain.MarketMapRun{ID: "interrupted-run", Mode: domain.MarketMapModeQuick, StartedAt: "2026-08-23T10:00:00Z", Status: domain.MarketMapRunRunning, RequestsUsed: 12, TargetsPlanned: 8, TargetsCompleted: 3, ObservationsCollected: 40}
	if err := seeded.AppendMarketMapRun(interrupted); err != nil { t.Fatal(err) }
	blocker, err := net.Listen("tcp", "127.0.0.1:0"); if err != nil { t.Fatal(err) }
	defer blocker.Close()
	_, portText, err := net.SplitHostPort(blocker.Addr().String()); if err != nil { t.Fatal(err) }
	var stdout, stderr strings.Builder
	code := run([]string{"serve", "--port", portText, "--data-dir", dataDir, "--no-open"}, &stdout, &stderr)
	if code != 1 { t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String()) }
	if !strings.Contains(strings.ToLower(stderr.String()), "cannot start market signal lab at") { t.Fatalf("unexpected failure path: %q", stderr.String()) }
	reopened, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	got, ok, err := reopened.MarketMapRunByID(interrupted.ID); if err != nil { t.Fatal(err) }
	if !ok { t.Fatal("seeded run missing after failed serve") }
	if got.Status != domain.MarketMapRunRunning || got.CompletedAt != "" || len(got.Errors) != 0 { t.Fatalf("failed port acquisition mutated run: %+v", got) }
}

func TestMarketMapRefusesLiveInstanceBeforeReconciliation(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	st, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	seed := domain.MarketMapRun{ID:"headless-live-conflict", Mode:domain.MarketMapModeQuick, StartedAt:"2026-08-23T10:00:00Z", Status:domain.MarketMapRunRunning}
	if err := st.AppendMarketMapRun(seed); err != nil { t.Fatal(err) }
	existing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" { http.NotFound(w,r); return }
		_, _ = w.Write([]byte(`{"app":"Market Signal Lab","version":"0.3.0-alpha.6.5.3-preview.1"}`))
	}))
	defer existing.Close()
	u, _ := url.Parse(existing.URL); _, portText, _ := net.SplitHostPort(u.Host)
	var stdout, stderr strings.Builder
	code := run([]string{"market-map","--port",portText,"--data-dir",dataDir,"--no-open"}, &stdout, &stderr)
	message := strings.ToLower(stderr.String())
	if code != 1 || !strings.Contains(message, "0.3.0-alpha.6.5.3-preview.1") || !strings.Contains(message, "run this market map again") { t.Fatalf("code=%d stderr=%q", code, stderr.String()) }
	reopened, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	got, ok, err := reopened.MarketMapRunByID(seed.ID); if err != nil || !ok { t.Fatalf("run ok=%v err=%v", ok, err) }
	if got.Status != domain.MarketMapRunRunning || got.CompletedAt != "" || len(got.Errors) != 0 { t.Fatalf("live-instance refusal mutated run: %+v", got) }
}

func TestMarketMapReconcilesInterruptedRunBeforeHeadlessFailure(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	st, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	seed := domain.MarketMapRun{ID:"headless-recovery", Mode:domain.MarketMapModeQuick, StartedAt:"2026-08-23T10:00:00Z", Status:domain.MarketMapRunRunning, RequestsUsed:9, TargetsPlanned:14, TargetsCompleted:2, ObservationsCollected:30}
	if err := st.AppendMarketMapRun(seed); err != nil { t.Fatal(err) }
	listener, err := net.Listen("tcp", "127.0.0.1:0"); if err != nil { t.Fatal(err) }
	_, portText, err := net.SplitHostPort(listener.Addr().String()); if err != nil { t.Fatal(err) }
	_ = listener.Close()
	oldFactory := runtimeCredentialManagerFactory
	runtimeCredentialManagerFactory = func(root, envName string) *credentialspkg.Manager { return credentialspkg.NewManager(&cliSecretStore{}, root, func(string) string { return "" }, envName) }
	defer func(){ runtimeCredentialManagerFactory = oldFactory }()
	var stdout, stderr strings.Builder
	code := run([]string{"market-map","--port",portText,"--data-dir",dataDir,"--no-open"}, &stdout, &stderr)
	if code != 1 { t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String()) }
	reopened, err := storage.Open(dataDir); if err != nil { t.Fatal(err) }
	got, ok, err := reopened.MarketMapRunByID(seed.ID); if err != nil || !ok { t.Fatalf("run ok=%v err=%v", ok, err) }
	if got.Status != domain.MarketMapRunFailed || got.CompletedAt == "" { t.Fatalf("headless path did not reconcile run: %+v", got) }
	if len(got.Errors) != 1 || got.Errors[0] != "market map interrupted by previous application exit" { t.Fatalf("recovery errors=%v", got.Errors) }
	if got.RequestsUsed != seed.RequestsUsed || got.TargetsCompleted != seed.TargetsCompleted || got.ObservationsCollected != seed.ObservationsCollected { t.Fatalf("recovery changed counters: %+v", got) }
}
