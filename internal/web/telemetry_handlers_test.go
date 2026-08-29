package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func telemetryEnvatoServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
		case "/v1/discovery/search/search/item":
			w.Write([]byte(`{"total_hits":1,"matches":[{"id":9,"name":"Probe"}]}`))
		default:
			if strings.Contains(r.URL.Path, "popular:") || strings.Contains(r.URL.Path, "random-new-files:") {
				time.Sleep(30 * time.Millisecond)
				w.Write([]byte(`{"items":[{"id":"1","name":"Pack Mockup","author_username":"a","category":"mockups"}]}`))
				return
			}
			http.NotFound(w, r)
		}
	}))
}

func TestAutopilotRunReturnsAcceptedAndLiveSnapshot(t *testing.T) {
	const token = "SECRET_TOKEN"
	api := telemetryEnvatoServer()
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), token)
	srv := New(svc)
	body := bytes.NewBufferString(`{"mode":"quick"}`)
	r := httptest.NewRequest(http.MethodPost, "/api/autopilot/run", body)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), token) {
		t.Fatal("token leaked")
	}
	var snap map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	id, _ := snap["runId"].(string)
	if id == "" {
		t.Fatal("missing runId")
	}
	r = httptest.NewRequest(http.MethodGet, "/api/autopilot/live?runId="+id, nil)
	w = httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), id) {
		t.Fatalf("live=%d %s", w.Code, w.Body.String())
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		latest, ok, err := svc.AutopilotRuntimeSnapshot(id)
		if err != nil {
			t.Fatal(err)
		}
		if ok && (latest.Status == "completed" || latest.Status == "partial" || latest.Status == "failed" || latest.Status == "cancelled") {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("background autopilot run did not reach a terminal state before test cleanup")
}

func TestTelemetryUnknownRunIs404(t *testing.T) {
	st, _ := storage.Open(t.TempDir())
	srv := New(app.New(st))
	r := httptest.NewRequest(http.MethodGet, "/api/autopilot/live?runId=missing", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatalf("%d", w.Code)
	}
}
