package web

import (
	"bytes"
	"encoding/json"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func autopilotWebServer(t *testing.T) *Server {
	t.Helper()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
			return
		case "/v1/discovery/search/search/item":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		default:
			if strings.Contains(r.URL.Path, "popular:") || strings.Contains(r.URL.Path, "random-new-files:") {
				time.Sleep(25 * time.Millisecond)
				_, _ = w.Write([]byte(`{"items":[{"id":"1","name":"Observed Presentation","author_username":"a","category":"presentation-templates"}]}`))
				return
			}
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(api.Close)
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _, _ := newCredentialWebService(t, client, "handler-token")
	return New(svc)
}

func TestAutopilotRunIsAsyncAndExposesLiveState(t *testing.T) {
	srv := autopilotWebServer(t)
	r := httptest.NewRequest(http.MethodPost, "/api/autopilot/run", bytes.NewBufferString(`{"mode":"quick"}`))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("run status=%d body=%s", w.Code, w.Body.String())
	}
	var started domain.ScanRuntimeSnapshot
	if err := json.Unmarshal(w.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	if started.RunID == "" {
		t.Fatal("missing run id")
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		r = httptest.NewRequest(http.MethodGet, "/api/autopilot/live?runId="+started.RunID, nil)
		w = httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code == http.StatusNotFound {
			time.Sleep(25 * time.Millisecond)
			continue
		}
		if w.Code != http.StatusOK {
			t.Fatalf("live status=%d body=%s", w.Code, w.Body.String())
		}
		var snap domain.ScanRuntimeSnapshot
		if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
			t.Fatal(err)
		}
		if snap.Status == domain.MarketMapRunCompleted || snap.Status == domain.MarketMapRunPartial || snap.Status == domain.MarketMapRunFailed || snap.Status == domain.MarketMapRunCancelled {
			if snap.Status == domain.MarketMapRunFailed {
				t.Fatalf("run failed: %+v", snap)
			}
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("autopilot run did not reach terminal state")
}

func TestAutopilotRunRejectsLegacyTokenField(t *testing.T) {
	const canary = "MSL_LEGACY_AUTOPILOT_TOKEN_9F21"
	srv := autopilotWebServer(t)
	r := httptest.NewRequest(http.MethodPost, "/api/autopilot/run", bytes.NewBufferString(`{"token":"`+canary+`","mode":"quick"}`))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), canary) {
		t.Fatalf("legacy token echoed: %s", w.Body.String())
	}
}

func TestAutopilotRunRejectsConcurrentStart(t *testing.T) {
	srv := autopilotWebServer(t)
	start := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/autopilot/run", bytes.NewBufferString(`{"mode":"quick"}`))
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		return w
	}
	first := start()
	if first.Code != http.StatusAccepted {
		t.Fatalf("first=%d %s", first.Code, first.Body.String())
	}
	var started domain.ScanRuntimeSnapshot
	if err := json.Unmarshal(first.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	if started.RunID == "" {
		t.Fatal("missing first run id")
	}
	second := start()
	if second.Code != http.StatusConflict {
		t.Fatalf("second=%d %s", second.Code, second.Body.String())
	}
	if !strings.Contains(second.Body.String(), "autopilot_run_active") {
		t.Fatalf("missing conflict code: %s", second.Body.String())
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		r := httptest.NewRequest(http.MethodGet, "/api/autopilot/live?runId="+started.RunID, nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code == http.StatusNotFound {
			time.Sleep(25 * time.Millisecond)
			continue
		}
		if w.Code != http.StatusOK {
			t.Fatalf("live status=%d body=%s", w.Code, w.Body.String())
		}
		var snap domain.ScanRuntimeSnapshot
		if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
			t.Fatal(err)
		}
		if snap.Status == domain.MarketMapRunCompleted || snap.Status == domain.MarketMapRunPartial || snap.Status == domain.MarketMapRunFailed || snap.Status == domain.MarketMapRunCancelled {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("first autopilot run did not reach terminal state before test cleanup")
}

func TestAutopilotLatestBeforeAnyRunIsUnavailable(t *testing.T) {
	srv := autopilotWebServer(t)
	r := httptest.NewRequest(http.MethodGet, "/api/autopilot/latest", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"available":false`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAutopilotInvestigateRejectsUnknownSource(t *testing.T) {
	srv := autopilotWebServer(t)
	r := httptest.NewRequest(http.MethodPost, "/api/autopilot/investigate", bytes.NewBufferString(`{"sourceType":"unknown","sourceId":"missing"}`))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
