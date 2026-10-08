package web

import (
	"encoding/json"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestIntegrityEndpointsReturnReadModelsWithoutSecrets(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.New(st)
	_ = st.AppendSampleAudit(domain.SampleAudit{ID: "audit-1", RunID: "run-1", GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendMarketIndexSnapshot(domain.MarketIndexSnapshot{ID: "index-1", RunID: "run-1", Level: domain.SegmentLevelGlobal, EntityID: "global", IntegrityStatus: domain.IntegrityStatusNativeAlpha65, GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendScoreProvenance(domain.ScoreProvenance{ID: "prov-1", RunID: "run-1", ScoreType: "composition", EntityType: "global", EntityID: "global", GeneratedAt: "2026-08-16T00:00:00Z"})
	server := httptest.NewServer(New(svc).Handler())
	defer server.Close()
	for _, path := range []string{
		"/api/integrity/sample-audit?runId=run-1",
		"/api/integrity/indices?runId=run-1",
		"/api/integrity/provenance?id=prov-1",
		"/api/integrity/surfaces?runId=run-1",
		"/api/integrity/legacy-reviews",
	} {
		resp, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("path=%s status=%d", path, resp.StatusCode)
		}
		var payload any
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		raw, _ := json.Marshal(payload)
		lower := strings.ToLower(string(raw))
		for _, forbidden := range []string{"authorization", "bearer ", "rawpayload", "raw_payload", "personal token"} {
			if strings.Contains(lower, forbidden) {
				t.Fatalf("path=%s leaked %q", path, forbidden)
			}
		}
	}
}

func TestIntegrityIndicesExposeStructuralSemantics(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.New(st)
	if err := st.AppendMarketIndexSnapshot(domain.MarketIndexSnapshot{
		ID: "index-2", RunID: "run-2", Level: domain.SegmentLevelGlobal, EntityID: "global",
		IntegrityStatus:     domain.IntegrityStatusNativeAlpha65,
		GeneratedAt:         "2026-08-16T00:00:00Z",
		CompositionIndex:    0.42,
		VolumeWeightedValue: 0.31,
		EqualSectorValue:    0.25,
		DivergenceValue:     0.06,
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(New(svc).Handler())
	defer server.Close()
	resp, err := http.Get(server.URL + "/api/integrity/indices?runId=run-2")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	if len(raw) == 0 {
		t.Fatal("expected at least one index row")
	}
	row := raw[0]
	for _, key := range []string{"id", "runId", "level", "entityId", "compositionIndex", "volumeWeightedValue", "equalSectorValue", "divergenceValue"} {
		if _, ok := row[key]; !ok {
			t.Fatalf("missing legacy key %q in %+v", key, row)
		}
	}
	semanticsRaw, ok := row["semantics"].(map[string]any)
	if !ok {
		t.Fatalf("missing semantics object in %+v", row)
	}
	if _, ok := semanticsRaw["compositionWeightingGap"]; !ok {
		t.Fatalf("missing semantics.compositionWeightingGap in %+v", semanticsRaw)
	}
}

func TestIntegrityEndpointsValidateMethodAndIdentity(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	for _, path := range []string{"/api/integrity/sample-audit", "/api/integrity/indices", "/api/integrity/surfaces", "/api/integrity/provenance"} {
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("path=%s status=%d", path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/integrity/legacy-reviews", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("method status=%d", w.Code)
	}
}
