package app

import (
	"context"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

type countingCredentialStore struct {
	secret string
	reads  int
}

func (s *countingCredentialStore) Read(string) (string, bool, error) {
	s.reads++
	return s.secret, s.secret != "", nil
}
func (s *countingCredentialStore) Write(_ string, secret string) error { s.secret = secret; return nil }
func (s *countingCredentialStore) Delete(string) error                { s.secret = ""; return nil }

func TestAutopilotRunManagerReturnsBeforeScanCompletesAndPersistsTerminal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
			return
		case "/v1/discovery/search/search/item":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		default:
			time.Sleep(120 * time.Millisecond)
			if containsPath(r.URL.Path, "popular:") || containsPath(r.URL.Path, "random-new-files:") {
				_, _ = w.Write([]byte(`{"items":[{"id":"1","name":"Packaging Mockup","author_username":"a","category":"mockups"}]}`))
				return
			}
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	client := envatoconn.NewClient(envatoconn.WithBaseURL(srv.URL))
	vault := &countingCredentialStore{secret: "session-token"}
	manager := credentialspkg.NewManager(vault, st.Root(), func(string) string { return "" }, credentialspkg.DefaultEnvName)
	svc := NewWithEnvatoClientAndAnalyticsEngineAndCredentials(st, client, &appTestEngine{name: "test-rust"}, manager)
	t.Cleanup(func() { _ = svc.Close() })
	start := time.Now()
	snap, err := svc.StartMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("start blocked: %v", time.Since(start))
	}
	if snap.RunID == "" {
		t.Fatal("missing run id")
	}
	readsAfterStart := vault.reads
	if _, err := svc.StartMarketAutopilot(context.Background(), domain.MarketMapModeQuick); err == nil {
		t.Fatal("expected active conflict")
	}
	if vault.reads != readsAfterStart {
		t.Fatalf("active conflict re-read credential store: before=%d after=%d", readsAfterStart, vault.reads)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s, ok, err := svc.AutopilotRuntimeSnapshot(snap.RunID)
		if err != nil {
			t.Fatal(err)
		}
		if ok && terminalStatus(s.Status) {
			if s.Status == domain.MarketMapRunFailed {
				t.Fatalf("failed snapshot=%+v", s)
			}
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("run did not finish")
}

func containsPath(s, sub string) bool {
	return len(s) >= len(sub) && func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}()
}
