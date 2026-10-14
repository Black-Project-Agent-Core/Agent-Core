package web

import (
	"bytes"
	"encoding/json"
	envatoconn "marketsignallab/internal/connectors/envato"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func credentialValidationServer(t *testing.T, expectedToken string, reject bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+expectedToken {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if reject {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid credential"}`))
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

func TestEnvatoConnectionStatusBeforeSetupIsTokenFree(t *testing.T) {
	api := credentialValidationServer(t, "unused", false)
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "")
	r := httptest.NewRequest(http.MethodGet, "/api/connections/envato", nil)
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["configured"] != false || payload["status"] != "not_configured" {
		t.Fatalf("payload=%v", payload)
	}
	if _, ok := payload["token"]; ok {
		t.Fatalf("response exposes token field: %s", w.Body.String())
	}
}

func TestEnvatoConnectionSetupValidatesThenPersistsWithoutEchoingSecret(t *testing.T) {
	const canary = "MSL_WEB_SETUP_CANARY_7F83"
	api := credentialValidationServer(t, canary, false)
	defer api.Close()
	svc, _, vault := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "")
	r := httptest.NewRequest(http.MethodPost, "/api/connections/envato", bytes.NewBufferString(`{"token":"`+canary+`"}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !vault.found || vault.secret != canary {
		t.Fatalf("credential not persisted found=%v", vault.found)
	}
	body := w.Body.String()
	if strings.Contains(body, canary) || strings.Contains(strings.ToLower(body), `"token"`) {
		t.Fatalf("setup response leaked secret contract: %s", body)
	}
	if !strings.Contains(body, `"status":"connected"`) || !strings.Contains(body, `"credentialFingerprint"`) {
		t.Fatalf("missing safe connection state: %s", body)
	}
}

func TestEnvatoConnectionInvalidReplacementPreservesStoredSecretAndNeverEchoesAttempt(t *testing.T) {
	const attempted = "MSL_WEB_BAD_REPLACEMENT_5A91"
	api := credentialValidationServer(t, attempted, true)
	defer api.Close()
	svc, _, vault := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "working-old-token")
	r := httptest.NewRequest(http.MethodPost, "/api/connections/envato", bytes.NewBufferString(`{"token":"`+attempted+`"}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if vault.secret != "working-old-token" || !vault.found {
		t.Fatalf("old credential changed found=%v secret=%q", vault.found, vault.secret)
	}
	if strings.Contains(w.Body.String(), attempted) {
		t.Fatalf("error response echoed attempted token: %s", w.Body.String())
	}
}

func TestEnvatoConnectionTestUsesPersistedCredentialWithoutTokenBody(t *testing.T) {
	const token = "stored-web-token"
	api := credentialValidationServer(t, token, false)
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), token)
	r := httptest.NewRequest(http.MethodPost, "/api/connections/envato/test", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), token) || !strings.Contains(w.Body.String(), `"status":"connected"`) {
		t.Fatalf("unsafe/unexpected response: %s", w.Body.String())
	}
}

func TestEnvatoConnectionDeletePreservesResearchHistory(t *testing.T) {
	api := credentialValidationServer(t, "stored-token", false)
	defer api.Close()
	svc, st, vault := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "stored-token")
	marker := filepath.Join(st.Root(), "history", "connection-delete-preserves-history.marker")
	if err := os.WriteFile(marker, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodDelete, "/api/connections/envato", nil)
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if vault.found {
		t.Fatal("credential remains after delete")
	}
	if raw, err := os.ReadFile(marker); err != nil || string(raw) != "keep" {
		t.Fatalf("history changed raw=%q err=%v", raw, err)
	}
	if strings.Contains(strings.ToLower(w.Body.String()), `"token"`) {
		t.Fatalf("delete response exposes token field: %s", w.Body.String())
	}
}
