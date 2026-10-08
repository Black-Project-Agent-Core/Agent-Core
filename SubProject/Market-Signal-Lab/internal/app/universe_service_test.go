package app

import (
	"context"
	"encoding/json"
	"io/fs"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const universeRequestMarker = "fixture-marker-universe"

func newUniverseServiceForTestWithToken(t *testing.T, client *envatoconn.Client, token string) (*Service, *storage.Store) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	if client == nil {
		return New(st), st
	}
	return newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, token), st
}

func newUniverseServiceForTest(t *testing.T, client *envatoconn.Client) (*Service, *storage.Store) {
	return newUniverseServiceForTestWithToken(t, client, universeRequestMarker)
}

func mustSportsCatalog(t *testing.T, svc *Service) domain.CatalogNode {
	t.Helper()
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{
		Platform: "Envato Market", ContentType: "Presentation", Catalog: "Sports", Subcatalog: "Padel",
	})
	if err != nil {
		t.Fatal(err)
	}
	return path[len(path)-1]
}

func TestObserveEnvatoQueryRequestJSONHasNoToken(t *testing.T) {
	raw, err := json.Marshal(ObserveEnvatoQueryRequest{SessionID: "s1", QueryID: "q1"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(string(raw)), `"token"`) {
		t.Fatalf("request contract exposes token field: %s", raw)
	}
}

func TestEnsureCatalogPathReusesCanonicalNodes(t *testing.T) {
	svc, _ := newUniverseServiceForTest(t, nil)
	in := domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports", Subcatalog: "Padel"}
	a, err := svc.EnsureCatalogPath(in)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.EnsureCatalogPath(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(a) != len(b) || a[len(a)-1].ID != b[len(b)-1].ID {
		t.Fatalf("paths=%+v %+v", a, b)
	}
}

func TestStartResearchSessionRejectsBudgetAbovePolicy(t *testing.T) {
	svc, _ := newUniverseServiceForTest(t, nil)
	cat := mustSportsCatalog(t, svc)
	q, err := svc.CreateResearchQuery(domain.ResearchQuery{
		Name: "padel", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "padel",
		CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true,
		Filters: map[string]string{"site": "graphicriver.net", "page_size": "20"},
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_market_api", Scope: cat.ID, QueryIDs: []string{q.ID}, RequestBudget: 61})
	if err == nil {
		t.Fatal("expected source policy budget error")
	}
}

func TestObserveEnvatoQueryCreatesStableUniverseAndNeverPersistsToken(t *testing.T) {
	const persistenceCanary = "PERSISTENCE_CANARY_9371"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+persistenceCanary {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":2,"matches":[{"id":123,"name":"Padel Sponsorship Deck","author_username":"alice","url":"https://example.test/123","category":"presentation-templates"},{"id":456,"name":"Sports Club Proposal","author_username":"bob","url":"https://example.test/456","category":"presentation-templates"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, st := newUniverseServiceForTestWithToken(t, client, persistenceCanary)
	cat := mustSportsCatalog(t, svc)
	q, err := svc.CreateResearchQuery(domain.ResearchQuery{
		Name: "padel", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "padel",
		CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true,
		Filters: map[string]string{"site": "graphicriver.net", "page": "1", "page_size": "20"},
	})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_market_api", Scope: cat.ID, QueryIDs: []string{q.ID}, RequestBudget: 2})
	if err != nil {
		t.Fatal(err)
	}

	got, err := svc.ObserveEnvatoQuery(context.Background(), ObserveEnvatoQueryRequest{SessionID: session.ID, QueryID: q.ID})
	if err != nil {
		t.Fatal(err)
	}
	if got.Session.Status != domain.ResearchSessionCompleted || got.Session.CoverageEstimate != 100 || got.Observations != 2 {
		t.Fatalf("result=%+v", got)
	}
	obs, err := st.ProductObservations(domain.ObservationFilter{SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(obs) != 2 {
		t.Fatalf("observations=%d", len(obs))
	}
	products, _ := st.Products()
	authors, _ := st.Authors()
	if len(products) != 2 || len(authors) != 2 {
		t.Fatalf("products=%d authors=%d", len(products), len(authors))
	}

	err = filepath.WalkDir(st.Root(), func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(b), persistenceCanary) {
			t.Fatalf("token persisted in %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestRecordObservedProductIsIdempotentForExactObservation(t *testing.T) {
	svc, st := newUniverseServiceForTest(t, nil)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports"})
	if err != nil {
		t.Fatal(err)
	}
	cat := path[len(path)-1]
	q, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: cat.ID, QueryIDs: []string{q.ID}, RequestBudget: 0})
	if err != nil {
		t.Fatal(err)
	}
	in := domain.ObservedProductInput{SessionID: session.ID, QueryID: q.ID, CatalogID: cat.ID, SourceType: "envato_elements_manual", ExternalItemID: "p1", Title: "Sports Deck", ExternalAuthorKey: "alice", AuthorDisplayName: "Alice", SurfaceType: "imported_snapshot", Position: 1, Page: 1, ObservedAt: "2026-08-15T04:00:00Z", ObservationReliability: 0.8}
	a, err := svc.recordObservedProduct(in)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.recordObservedProduct(in)
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != b.ID {
		t.Fatalf("idempotency failed: %s vs %s", a.ID, b.ID)
	}
	rows, err := st.ProductObservations(domain.ObservationFilter{SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows=%d want 1", len(rows))
	}
}

func TestImportObservedProductsCSVCompletesManualResearchScope(t *testing.T) {
	svc, st := newUniverseServiceForTest(t, nil)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports"})
	if err != nil {
		t.Fatal(err)
	}
	cat := path[len(path)-1]
	q1, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	q2, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "padel", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "padel", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: cat.ID, QueryIDs: []string{q1.ID, q2.ID}, RequestBudget: 0})
	if err != nil {
		t.Fatal(err)
	}
	csvText := "session_id,query_id,catalog_id,source_type,external_item_id,title,author_external_key,author_display_name,observed_at\n" +
		session.ID + "," + q1.ID + "," + cat.ID + ",envato_elements_manual,p1,Sports Deck,alice,Alice,2026-08-15T04:00:00Z\n" +
		session.ID + "," + q2.ID + "," + cat.ID + ",envato_elements_manual,p2,Padel Deck,bob,Bob,2026-08-15T04:01:00Z\n"
	n, err := svc.ImportObservedProductsCSV(strings.NewReader(csvText))
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("imported=%d", n)
	}
	latest, ok, err := svc.ResearchSession(session.ID)
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if latest.Status != domain.ResearchSessionCompleted || latest.CoverageEstimate != 100 {
		t.Fatalf("session=%+v", latest)
	}
	rows, err := st.ProductObservations(domain.ObservationFilter{SessionID: session.ID})
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows=%d err=%v", len(rows), err)
	}
}

func TestObserveEnvatoQueryMarksBudgetExhaustionPartial(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer api.Close()
	svc, _ := newUniverseServiceForTest(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {})))
	cat := mustSportsCatalog(t, svc)
	q1, _ := svc.CreateResearchQuery(domain.ResearchQuery{Name: "padel", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "padel", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true, Filters: map[string]string{"site": "graphicriver.net"}})
	q2, _ := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "sports", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true, Filters: map[string]string{"site": "graphicriver.net"}})
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_market_api", Scope: cat.ID, QueryIDs: []string{q1.ID, q2.ID}, RequestBudget: 1})
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.ObserveEnvatoQuery(context.Background(), ObserveEnvatoQueryRequest{SessionID: session.ID, QueryID: q1.ID})
	if err == nil {
		t.Fatal("expected connector error")
	}
	if got.Session.Status != domain.ResearchSessionPartial || got.Session.RequestsUsed != 1 || got.Session.CoverageEstimate != 0 {
		t.Fatalf("session=%+v", got.Session)
	}
}

func TestRepeatedObservationSegmentationDoesNotDuplicateSameVersion(t *testing.T) {
	svc, st := newUniverseServiceForTest(t, nil)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Graphics", Catalog: "Presentation Templates", Origin: domain.CatalogOriginManual})
	if err != nil {
		t.Fatal(err)
	}
	cat := path[len(path)-1]
	q, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "sports", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true, Filters: map[string]string{"site": "graphicriver.net"}})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_market_api", Scope: cat.ID, QueryIDs: []string{q.ID}, RequestBudget: 2})
	if err != nil {
		t.Fatal(err)
	}
	in := domain.ObservedProductInput{SessionID: session.ID, QueryID: q.ID, CatalogID: cat.ID, SourceType: "envato_market_api", ExternalItemID: "seg-p1", Title: "Padel Club Sponsorship Proposal", CategoryText: "Presentation Templates / Sports", SourceURL: "https://graphicriver.net/item/padel-club-sponsorship-proposal/123", SurfaceType: domain.MarketSurfacePopular, Position: 1, Page: 1, ObservedAt: "2026-08-16T04:00:00Z", ObservationReliability: 0.9}
	first, err := svc.recordObservedProduct(in)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.recordObservedProduct(in)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("observation ids differ: %s %s", first.ID, second.ID)
	}
	rows, err := st.ObservationSegmentations(domain.ObservationSegmentationFilter{ObservationID: first.ID, TaxonomyVersion: "taxonomy-segmentation-v0.1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("segmentations=%d want 1 rows=%+v", len(rows), rows)
	}
}
