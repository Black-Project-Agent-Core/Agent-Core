package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func seededConsensusServer(t *testing.T) *Server {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, &webHealthyAnalyticsEngine{})
	makePayload := func(exp, access string, ids []string) domain.SurfaceCapturePayload {
		p := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: domain.ObservationExperience(exp), AccessState: domain.ObservationAccessState(access), SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30}, PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test"}
		for i, id := range ids {
			p.Items = append(p.Items, domain.SurfaceCaptureItem{Rank: i + 1, ExternalItemID: id, SourceURL: "https://elements.envato.com/" + id + "-ABC123", Title: id, ProductTypeID: "mockup", UseCaseID: "branding", NormalizedCatalogID: "graphic_templates", TaxonomyConfidence: .9})
		}
		return p
	}
	a, err := svc.CreateSurfaceSnapshot(makePayload("public_web", "anonymous", []string{"p1", "p2"}))
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CreateSurfaceSnapshot(makePayload("subscriber_app", "active_subscriber", []string{"p1", "p3"}))
	if err != nil {
		t.Fatal(err)
	}
	pairs, err := svc.AutoPairCaptureBatch(a.CaptureBatchID, 10*time.Minute)
	if err != nil || len(pairs) == 0 {
		t.Fatalf("pairs=%+v err=%v", pairs, err)
	}
	if _, err := svc.CalculatePair(pairs[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RefreshMultiContextConsensus(domain.ConsensusRefreshRequest{CaptureBatchID: a.CaptureBatchID}); err != nil {
		t.Fatal(err)
	}
	return New(svc)
}
func seededNonComparableConsensusServer(t *testing.T) (*Server, string) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, &webHealthyAnalyticsEngine{})
	base := func(exp, sort string) domain.SurfaceCapturePayload {
		return domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: domain.ObservationExperience(exp), AccessState: "anonymous", SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: sort, Locale: "en", PageSizeOrTopK: 30}, PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test", Items: []domain.SurfaceCaptureItem{{Rank: 1, ExternalItemID: exp + sort, SourceURL: "https://elements.envato.com/" + exp + sort + "-ABC123", Title: "x"}}}
	}
	a, _ := svc.CreateSurfaceSnapshot(base("public_web", "popular"))
	b, _ := svc.CreateSurfaceSnapshot(base("subscriber_app", "new"))
	// Store explicit non-comparable pair for audit.
	pair := domain.SnapshotPair{ID: "pair-incompatible", CaptureBatchID: a.CaptureBatchID, SnapshotAID: a.Snapshot.ID, SnapshotBID: b.Snapshot.ID, ContextAID: a.Context.ID, ContextBID: b.Context.ID, Comparable: false, CommonTopK: 30, ReasonCodes: []string{"sort_mode_mismatch"}, ComparabilityModel: "paired-comparability-v0.1", CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	_ = st.AppendSnapshotPair(pair)
	return New(svc), pair.ID
}
func TestConsensusDashboardAndPairRoutes(t *testing.T) {
	server := seededConsensusServer(t)
	for _, path := range []string{"/api/consensus/dashboard", "/api/consensus/contexts", "/api/consensus/snapshots", "/api/consensus/pairs", "/api/consensus/matrix"} {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		server.Handler().ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("path=%s code=%d body=%s", path, rr.Code, rr.Body.String())
		}
	}
}
func TestNonComparablePairReturnsAuditWithoutMetrics(t *testing.T) {
	server, pairID := seededNonComparableConsensusServer(t)
	body, _ := json.Marshal(map[string]string{"pairId": pairID})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/consensus/pairs/calculate", bytes.NewReader(body))
	server.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("code=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "pair_not_comparable") {
		t.Fatalf("body=%s", rr.Body.String())
	}
}
func TestConsensusResponsesDoNotExposeSecretsOrRawHTML(t *testing.T) {
	server := seededConsensusServer(t)
	rr := httptest.NewRecorder()
	server.Handler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/consensus/dashboard", nil))
	lower := strings.ToLower(rr.Body.String())
	for _, forbidden := range []string{"authorization", "cookie", "password", "rawhtml", "raw_html"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("forbidden %q in %s", forbidden, rr.Body.String())
		}
	}
}
