package web

import (
	"bytes"
	envatoconn "marketsignallab/internal/connectors/envato"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestScannerConnectionEndpointVerifiesStoredCredential(t *testing.T) {
	api := credentialValidationServer(t, "scanner-token", false)
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _, _ := newCredentialWebService(t, client, "scanner-token")
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/test", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"status":"connected"`) || strings.Contains(w.Body.String(), "scanner-token") {
		t.Fatalf("response=%s", w.Body.String())
	}
}

func TestScannerConnectionAuthFailureUsesTypedSafeError(t *testing.T) {
	api := credentialValidationServer(t, "scanner-token", true)
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _, _ := newCredentialWebService(t, client, "scanner-token")
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/test", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "envato_authentication_failed") || strings.Contains(w.Body.String(), "scanner-token") {
		t.Fatalf("response=%s", w.Body.String())
	}
}

func TestScannerRunUsesResolvedCredentialAndReturnsObservedCounts(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer scanner-token" {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/v1/discovery/search/search/item" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":2,"matches":[{"id":101,"name":"Padel Deck","author_username":"alice","category":"presentation-templates"},{"id":102,"name":"Sports Proposal","author_username":"bob","category":"presentation-templates"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _, _ := newCredentialWebService(t, client, "scanner-token")
	body := `{"catalog":{"platform":"Envato Market","contentType":"Presentation","catalog":"Sports"},"keywords":["padel"],"site":"graphicriver.net","category":"presentation-templates","maxPages":1,"pageSize":20,"requestBudget":2}`
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/run", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	for _, want := range []string{`"summaryCode":"SCAN_COMPLETE"`, `"observations":2`, `"products":2`, `"authors":2`} {
		if !strings.Contains(w.Body.String(), want) {
			t.Fatalf("missing %s body=%s", want, w.Body.String())
		}
	}
	if strings.Contains(w.Body.String(), "scanner-token") {
		t.Fatalf("response leaked credential: %s", w.Body.String())
	}
}

func TestScannerRunRejectsLegacyTokenField(t *testing.T) {
	const canary = "MSL_LEGACY_SCANNER_TOKEN_4C61"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }))
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "stored-token")
	body := `{"token":"` + canary + `","catalog":{"platform":"Envato Market","contentType":"Presentation"},"keywords":["x"],"site":"graphicriver.net","maxPages":1,"pageSize":20,"requestBudget":2}`
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/run", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), canary) {
		t.Fatalf("legacy token echoed: %s", w.Body.String())
	}
}

func TestScannerRunRejectsUnsupportedEnvatoSiteBeforeRequest(t *testing.T) {
	calls := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; http.NotFound(w, r) }))
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "scanner-token")
	body := `{"catalog":{"platform":"Envato Market","contentType":"Presentation"},"keywords":["x"],"site":"private.example.test","maxPages":1,"pageSize":20,"requestBudget":2}`
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/run", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnprocessableEntity || calls != 0 {
		t.Fatalf("status=%d calls=%d body=%s", w.Code, calls, w.Body.String())
	}
}

func TestScannerRunConnectorFailureDoesNotEchoRawResponseBody(t *testing.T) {
	const rawBody = "RAW_SCANNER_PROVIDER_BODY_DO_NOT_ECHO"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(rawBody))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _, _ := newCredentialWebService(t, client, "scanner-token")
	body := `{"catalog":{"platform":"Envato Market","contentType":"Presentation"},"keywords":["x"],"site":"graphicriver.net","maxPages":1,"pageSize":20,"requestBudget":2}`
	r := httptest.NewRequest(http.MethodPost, "/api/scanner/envato/run", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), rawBody) || strings.Contains(w.Body.String(), "scanner-token") {
		t.Fatalf("unsafe response: %s", w.Body.String())
	}
}
