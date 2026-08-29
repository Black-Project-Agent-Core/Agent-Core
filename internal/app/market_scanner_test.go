package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const marketScanMarker = "fixture-marker-market-scan"

func TestMarketScanContractsDoNotExposeToken(t *testing.T) {
	requestRaw, err := json.Marshal(domain.MarketScanRequest{Catalog: domain.CatalogPathInput{ContentType: "Presentation"}, Keywords: []string{"x"}, Site: "graphicriver.net"})
	if err != nil {
		t.Fatal(err)
	}
	resultRaw, err := json.Marshal(domain.MarketScanResult{Session: domain.ResearchSession{ID: "s1"}})
	if err != nil {
		t.Fatal(err)
	}
	for name, raw := range map[string][]byte{"request": requestRaw, "result": resultRaw} {
		if strings.Contains(strings.ToLower(string(raw)), `"token"`) {
			t.Fatalf("%s contract exposes token field: %s", name, raw)
		}
	}
}

func TestRunEnvatoMarketScanScansMultipleQueriesAndPages(t *testing.T) {
	calls := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer "+marketScanMarker {
			t.Errorf("missing bearer auth")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		term := r.URL.Query().Get("term")
		page := r.URL.Query().Get("page")
		w.Header().Set("Content-Type", "application/json")
		switch term + ":" + page {
		case "padel presentation:1":
			_, _ = w.Write([]byte(`{"total_hits":3,"matches":[{"id":101,"name":"Padel Sponsorship Deck","author_username":"alice","url":"https://example.test/101","category":"presentation-templates"},{"id":102,"name":"Padel Club Proposal","author_username":"bob","url":"https://example.test/102","category":"presentation-templates"}]}`))
		case "padel presentation:2":
			_, _ = w.Write([]byte(`{"total_hits":3,"matches":[{"id":103,"name":"Padel Partnership Deck","author_username":"alice","url":"https://example.test/103","category":"presentation-templates"}]}`))
		case "sports proposal:1":
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":102,"name":"Padel Club Proposal","author_username":"bob","url":"https://example.test/102","category":"presentation-templates"}]}`))
		default:
			t.Errorf("unexpected request term=%q page=%q", term, page)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer api.Close()

	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, st := newUniverseServiceForTestWithToken(t, client, marketScanMarker)
	got, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog:  domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Sports", Subcatalog: "Padel"},
		Keywords: []string{"padel presentation", "sports proposal"},
		Site:     "graphicriver.net", Category: "presentation-templates", MaxPages: 3, PageSize: 2, RequestBudget: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Fatalf("calls=%d want 3", calls)
	}
	if got.Session.Status != domain.ResearchSessionCompleted || got.Session.CoverageEstimate != 100 {
		t.Fatalf("session=%+v", got.Session)
	}
	if got.Session.PagesCompleted != 3 || got.Session.PagesPlanned != 3 {
		t.Fatalf("pages=%d/%d", got.Session.PagesCompleted, got.Session.PagesPlanned)
	}
	if got.Observations != 4 || got.Products != 3 || got.Authors != 2 {
		t.Fatalf("counts observations=%d products=%d authors=%d", got.Observations, got.Products, got.Authors)
	}
	if len(got.QueryResults) != 2 || got.QueryResults[0].PagesCompleted != 2 || got.QueryResults[1].PagesCompleted != 1 {
		t.Fatalf("query results=%+v", got.QueryResults)
	}
	observations, err := st.ProductObservations(domain.ObservationFilter{SessionID: got.Session.ID})
	if err != nil {
		t.Fatal(err)
	}
	foundGlobalThird := false
	for _, row := range observations {
		if row.Page == 2 && row.Position == 3 {
			foundGlobalThird = true
		}
	}
	if !foundGlobalThird {
		t.Fatalf("page-two global position missing: %+v", observations)
	}
}

func TestRunEnvatoMarketScanStopsAtRequestBudgetAsPartial(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := r.URL.Query().Get("page")
		term := r.URL.Query().Get("term")
		_, _ = w.Write([]byte(`{"total_hits":50,"matches":[{"id":"` + term + `-` + page + `","name":"Result","author_username":"author"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _ := newUniverseServiceForTestWithToken(t, client, marketScanMarker)
	got, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog:  domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Business"},
		Keywords: []string{"pitch deck", "business plan"}, Site: "graphicriver.net", MaxPages: 3, PageSize: 1, RequestBudget: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Session.Status != domain.ResearchSessionPartial || got.Session.RequestsUsed != 2 {
		t.Fatalf("session=%+v", got.Session)
	}
	if got.Session.CoverageEstimate >= 100 || got.SummaryCode != "SCAN_PARTIAL_BUDGET" {
		t.Fatalf("coverage=%v summary=%s", got.Session.CoverageEstimate, got.SummaryCode)
	}
}

func TestRunEnvatoMarketScanRedactsTokenFromPersistentFiles(t *testing.T) {
	const sentinel = "PERSISTENCE_CANARY_ALPHA4_88391"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+sentinel {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":1,"name":"Item","author_username":"author"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, st := newUniverseServiceForTestWithToken(t, client, sentinel)
	if _, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog:  domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Test"},
		Keywords: []string{"test"}, Site: "graphicriver.net", MaxPages: 1, PageSize: 20, RequestBudget: 2,
	}); err != nil {
		t.Fatal(err)
	}
	err := filepath.WalkDir(st.Root(), func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(data), sentinel) {
			t.Fatalf("token persisted in %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	exported, err := json.Marshal(bundle)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(exported), sentinel) {
		t.Fatal("request-scoped token leaked into export bundle")
	}
	if strings.Contains(strings.ToLower(string(exported)), `"token"`) {
		t.Fatal("export bundle exposes a token field")
	}
}

func TestRunEnvatoMarketScanMarksCancelledSession(t *testing.T) {
	svc, _ := newUniverseServiceForTestWithToken(t, envatoconn.NewClient(envatoconn.WithBaseURL("http://127.0.0.1:1")), marketScanMarker)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, err := svc.RunEnvatoMarketScan(ctx, domain.MarketScanRequest{
		Catalog:  domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Cancelled"},
		Keywords: []string{"cancelled"}, Site: "graphicriver.net", MaxPages: 1, PageSize: 20, RequestBudget: 2,
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	if got.Session.Status != domain.ResearchSessionCancelled {
		t.Fatalf("session=%+v", got.Session)
	}
}

func TestRunEnvatoMarketScanCountsRateLimitRetryAgainstBudget(t *testing.T) {
	calls := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":51,"name":"Recovered Result","author_username":"public-author"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, _ := newUniverseServiceForTestWithToken(t, client, marketScanMarker)
	got, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog: domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Retry"},
		Keywords: []string{"retry result"}, Site: "graphicriver.net", MaxPages: 1, PageSize: 20, RequestBudget: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || got.Session.RequestsUsed != 2 || got.Session.Status != domain.ResearchSessionCompleted {
		t.Fatalf("calls=%d session=%+v", calls, got.Session)
	}
}

func TestRunEnvatoMarketScanAuditsHTTPFailureWithoutRawResponseBody(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`RAW_PRIVATE_STYLE_BODY_MUST_NOT_PERSIST`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc, st := newUniverseServiceForTestWithToken(t, client, marketScanMarker)
	got, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog: domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Failure"},
		Keywords: []string{"failed result"}, Site: "graphicriver.net", MaxPages: 1, PageSize: 20, RequestBudget: 2,
	})
	if err == nil {
		t.Fatal("expected connector error")
	}
	if got.Session.Status != domain.ResearchSessionFailed || len(got.Session.Errors) != 1 {
		t.Fatalf("session=%+v", got.Session)
	}
	persisted, ok, readErr := st.LatestResearchSession(got.Session.ID)
	if readErr != nil || !ok {
		t.Fatalf("persisted ok=%v err=%v", ok, readErr)
	}
	raw, _ := json.Marshal(persisted)
	if bytes.Contains(raw, []byte("RAW_PRIVATE_STYLE_BODY_MUST_NOT_PERSIST")) {
		t.Fatalf("raw HTTP response body persisted: %s", raw)
	}
}
