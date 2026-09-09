package app

import (
	"context"
	"fmt"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func realAutopilotIntegrationServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer real-session-token" {
			t.Errorf("bad auth")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		site := marketSiteFromPath(r.URL.Path)
		switch {
		case strings.Contains(r.URL.Path, "/v1/market/categories:"):
			_, _ = w.Write([]byte(`{"categories":[{"name":"Presentation Templates","path":"presentation-templates"},{"name":"Mockups","path":"mockups"}]}`))
		case strings.Contains(r.URL.Path, "/v1/market/popular:"):
			_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-sponsor-a","name":"Padel Club Sponsorship Presentation","author_username":"studio-a","category":"presentation-templates"},{"id":"%s-sponsor-b","name":"Sports Sponsorship Proposal Deck","author_username":"studio-b","category":"presentation-templates"}]}`, site, site)))
		case strings.Contains(r.URL.Path, "/v1/market/random-new-files:"):
			_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-pack-a","name":"Cosmetic Packaging Mockup","author_username":"studio-c","category":"mockups"},{"id":"%s-pack-b","name":"Bottle Package Mockup","author_username":"studio-d","category":"mockups"}]}`, site, site)))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestAutopilotIntegratesDirectionsInsightsSeedsAndExport(t *testing.T) {
	api := realAutopilotIntegrationServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "real-session-token")

	view, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if view.Direction == nil || !view.Direction.CompositionOnly {
		t.Fatalf("first map must be composition-only: %+v", view.Direction)
	}
	if len(view.Directions) < 2 {
		t.Fatalf("expected product direction clusters, got %+v", view.Directions)
	}
	if len(view.Insights) == 0 {
		t.Fatal("expected deterministic production insights")
	}

	seed, err := svc.CreateAdvancedResearchSeed("product_direction", view.Directions[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if seed.SourceID != view.Directions[0].ID || len(seed.Keywords) == 0 || seed.MaxPages != 3 || seed.RequestBudget != 12 || seed.WindowDays != 30 {
		t.Fatalf("unexpected advanced seed %+v", seed)
	}

	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Version != "0.3.0-alpha.6.5.3-preview.1" || len(bundle.MarketMapRuns) != 1 || len(bundle.ProductDirections) < 2 || len(bundle.ProductionInsights) == 0 || len(bundle.AdvancedResearchSeeds) == 0 {
		t.Fatalf("incomplete alpha6 export: version=%s runs=%d directions=%d insights=%d seeds=%d", bundle.Version, len(bundle.MarketMapRuns), len(bundle.ProductDirections), len(bundle.ProductionInsights), len(bundle.AdvancedResearchSeeds))
	}
	raw := fmt.Sprintf("%+v", bundle)
	if strings.Contains(raw, "real-session-token") || strings.Contains(strings.ToLower(raw), "synthetic_demo") || strings.Contains(raw, "DEMO —") {
		t.Fatal("export leaked token or synthetic content")
	}
}
