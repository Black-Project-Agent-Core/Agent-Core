package app

import (
	"context"
	"errors"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/storage"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type credentialMemoryStore struct {
	secret     string
	found      bool
	readErr    error
	writeCount int
}

func (s *credentialMemoryStore) Read(string) (string, bool, error) {
	if s.readErr != nil {
		return "", false, s.readErr
	}
	return s.secret, s.found, nil
}
func (s *credentialMemoryStore) Write(_ string, secret string) error {
	s.writeCount++
	s.secret = secret
	s.found = true
	return nil
}
func (s *credentialMemoryStore) Delete(string) error {
	s.secret = ""
	s.found = false
	return nil
}

type credentialTimeoutError struct{}

func (credentialTimeoutError) Error() string   { return "timeout" }
func (credentialTimeoutError) Timeout() bool   { return true }
func (credentialTimeoutError) Temporary() bool { return true }

var _ net.Error = credentialTimeoutError{}

func credentialTestAPI(t *testing.T, expectedToken string, fail *atomic.Bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+expectedToken {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if fail != nil && fail.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid token"}`))
			return
		}
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
		case "/v1/discovery/search/search/item":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":1,"name":"Probe"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
}

func newCredentialServiceForTest(t *testing.T, vault *credentialMemoryStore, getenv func(string) string, api *httptest.Server) (*Service, *storage.Store, *credentialspkg.Manager) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	manager := credentialspkg.NewManager(vault, st.Root(), getenv, credentialspkg.DefaultEnvName)
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc := NewWithEnvatoClientAndAnalyticsEngineAndCredentials(st, client, &appTestEngine{name: "credential-test-rust"}, manager)
	t.Cleanup(func() { _ = svc.Close() })
	return svc, st, manager
}

func TestEnvatoCredentialDefaultServiceWiresManager(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := NewWithAnalyticsEngine(st, &appTestEngine{name: "credential-default-rust"})
	t.Cleanup(func() { _ = svc.Close() })
	if svc.credentials == nil {
		t.Fatal("default service did not construct credential manager")
	}
}

func TestEnvatoCredentialServiceConstructorWiresInjectedManager(t *testing.T) {
	api := credentialTestAPI(t, "unused", nil)
	defer api.Close()
	vault := &credentialMemoryStore{}
	svc, _, manager := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	if svc.credentials != manager {
		t.Fatal("credential manager injection was not preserved")
	}
}

func TestEnvatoCredentialValidTokenPersistsOnlyAfterValidation(t *testing.T) {
	vault := &credentialMemoryStore{}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if vault.found {
			t.Error("credential persisted before validation completed")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer good-token" {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
		case "/v1/discovery/search/search/item":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":1,"name":"Probe"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	status, err := svc.SaveEnvatoCredential(context.Background(), " good-token ")
	if err != nil {
		t.Fatal(err)
	}
	if !vault.found || vault.secret != "good-token" {
		t.Fatalf("vault found=%v secret=%q", vault.found, vault.secret)
	}
	if status.Status != EnvatoConnectionConnected || status.EffectiveSource != "credential_manager" || status.CredentialFingerprint != credentialspkg.Fingerprint("good-token") {
		t.Fatalf("status=%+v", status)
	}
}

func TestEnvatoCredentialInvalidReplacementPreservesOldCredential(t *testing.T) {
	vault := &credentialMemoryStore{secret: "old-token", found: true}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"bad-token rejected"}`))
	}))
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	_, err := svc.SaveEnvatoCredential(context.Background(), "bad-token")
	if err == nil {
		t.Fatal("expected invalid credential error")
	}
	if vault.secret != "old-token" || !vault.found {
		t.Fatalf("old credential lost: found=%v secret=%q", vault.found, vault.secret)
	}
	if strings.Contains(err.Error(), "bad-token") {
		t.Fatalf("error leaked token: %v", err)
	}
}

func TestEnvatoCredentialValidReplacementChangesFingerprint(t *testing.T) {
	vault := &credentialMemoryStore{secret: "old-token", found: true}
	api := credentialTestAPI(t, "new-token", nil)
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	status, err := svc.SaveEnvatoCredential(context.Background(), "new-token")
	if err != nil {
		t.Fatal(err)
	}
	if vault.secret != "new-token" || status.CredentialFingerprint != credentialspkg.Fingerprint("new-token") {
		t.Fatalf("status=%+v secret=%q", status, vault.secret)
	}
}

func TestEnvatoConnectionEnvironmentOverrideIsEffectiveWithoutPersistence(t *testing.T) {
	vault := &credentialMemoryStore{secret: "stored-token", found: true}
	api := credentialTestAPI(t, "override-token", nil)
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "override-token" }, api)
	status, err := svc.TestEnvatoConnection(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.EffectiveSource != "environment" || status.Status != EnvatoConnectionConnected {
		t.Fatalf("status=%+v", status)
	}
	if vault.secret != "stored-token" {
		t.Fatalf("override persisted=%q", vault.secret)
	}
}

func TestEnvatoCredentialRemovePreservesHistoryAndRuntimeOverride(t *testing.T) {
	vault := &credentialMemoryStore{secret: "stored-token", found: true}
	api := credentialTestAPI(t, "override-token", nil)
	defer api.Close()
	svc, st, manager := newCredentialServiceForTest(t, vault, func(string) string { return "override-token" }, api)
	if _, err := manager.ReplacePersistent("stored-token", credentialspkg.Metadata{Provider: "envato", LastStatus: "healthy"}); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(st.Root(), "history", "credential-remove-preserves-history.marker")
	if err := os.WriteFile(marker, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	status, err := svc.RemoveEnvatoCredential()
	if err != nil {
		t.Fatal(err)
	}
	if vault.found {
		t.Fatal("persistent credential remains")
	}
	if !status.Configured || status.EffectiveSource != "environment" {
		t.Fatalf("status=%+v", status)
	}
	if raw, err := os.ReadFile(marker); err != nil || string(raw) != "keep" {
		t.Fatalf("history marker changed raw=%q err=%v", raw, err)
	}
}

func TestEnvatoConnectionStatusNotConfigured(t *testing.T) {
	vault := &credentialMemoryStore{}
	api := credentialTestAPI(t, "unused", nil)
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	status := svc.EnvatoConnectionStatus()
	if status.Configured || status.Status != EnvatoConnectionNotConfigured {
		t.Fatalf("status=%+v", status)
	}
}

func TestEnvatoConnectionFailureClassification(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want EnvatoConnectionState
	}{
		{"unauthorized", &envatoconn.HTTPStatusError{StatusCode: 401}, EnvatoConnectionNeedsAttention},
		{"forbidden", &envatoconn.HTTPStatusError{StatusCode: 403}, EnvatoConnectionNeedsAttention},
		{"permission", &envatoconn.TokenPermissionError{RequiredPermission: "search"}, EnvatoConnectionNeedsAttention},
		{"rate_limit", &envatoconn.HTTPStatusError{StatusCode: 429}, EnvatoConnectionRateLimited},
		{"provider_500", &envatoconn.HTTPStatusError{StatusCode: 500}, EnvatoConnectionProviderError},
		{"timeout", credentialTimeoutError{}, EnvatoConnectionNetworkUnavailable},
		{"malformed", errors.New("invalid Envato total-items response"), EnvatoConnectionProviderResponseError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state, _, _ := classifyEnvatoProviderError(tt.err)
			if state != tt.want {
				t.Fatalf("state=%s want=%s", state, tt.want)
			}
		})
	}
}

func TestEnvatoCredentialStoreReadErrorClassifiesAsStoreFailure(t *testing.T) {
	vault := &credentialMemoryStore{readErr: errors.New("vault read failed")}
	api := credentialTestAPI(t, "unused", nil)
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	status, err := svc.TestEnvatoConnection(context.Background())
	if err == nil {
		t.Fatal("expected store error")
	}
	if status.Status != EnvatoConnectionCredentialStoreError {
		t.Fatalf("status=%+v", status)
	}
	if strings.Contains(err.Error(), "vault read failed") {
		t.Fatalf("public error exposed internal store detail: %v", err)
	}
}

func TestEnvatoConnectionFailureStatePersistsForStoredCredential(t *testing.T) {
	vault := &credentialMemoryStore{}
	var fail atomic.Bool
	api := credentialTestAPI(t, "stored-token", &fail)
	defer api.Close()
	svc, _, _ := newCredentialServiceForTest(t, vault, func(string) string { return "" }, api)
	if _, err := svc.SaveEnvatoCredential(context.Background(), "stored-token"); err != nil {
		t.Fatal(err)
	}
	if vault.writeCount != 1 {
		t.Fatalf("initial credential writes=%d", vault.writeCount)
	}
	fail.Store(true)
	status, err := svc.TestEnvatoConnection(context.Background())
	if err == nil || status.Status != EnvatoConnectionNeedsAttention {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	if vault.writeCount != 1 {
		t.Fatalf("connection test rewrote secret: writes=%d", vault.writeCount)
	}
	status = svc.EnvatoConnectionStatus()
	if status.Status != EnvatoConnectionNeedsAttention || !status.Configured {
		t.Fatalf("persisted status=%+v", status)
	}
}

func TestEnvatoConnectionStatusEnvironmentOverrideIgnoresCorruptPersistentMetadata(t *testing.T) {
	vault := &credentialMemoryStore{secret: "stored-token", found: true}
	api := credentialTestAPI(t, "override-token", nil)
	defer api.Close()
	svc, st, _ := newCredentialServiceForTest(t, vault, func(string) string { return "override-token" }, api)
	path := filepath.Join(st.Root(), "config", "connection.json")
	if err := os.WriteFile(path, []byte(`{"provider":`), 0o600); err != nil {
		t.Fatal(err)
	}
	status := svc.EnvatoConnectionStatus()
	if !status.Configured || status.EffectiveSource != "environment" || status.Status != EnvatoConnectionConfigured {
		t.Fatalf("status=%+v", status)
	}
}
