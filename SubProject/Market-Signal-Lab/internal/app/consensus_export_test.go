package app

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"strings"
	"testing"
)

func TestAlpha652ExportIncludesConsensusHistoryAndRedactsPrivateFields(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	p := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30}, PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test", Items: []domain.SurfaceCaptureItem{{Rank: 1, ExternalItemID: "p1", SourceURL: "https://elements.envato.com/p1-ABC123", Title: "P1", ProductTypeID: "mockup", UseCaseID: "branding", NormalizedCatalogID: "graphic_templates", TaxonomyConfidence: .9}}}
	if _, err := svc.CreateSurfaceSnapshot(p); err != nil {
		t.Fatal(err)
	}
	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%s", bundle.Version)
	}
	if len(bundle.ObservationContexts) == 0 || len(bundle.SurfaceSnapshots) == 0 {
		t.Fatalf("bundle missing consensus rows: %+v", bundle)
	}
	raw, _ := json.Marshal(bundle)
	lower := strings.ToLower(string(raw))
	for _, forbidden := range []string{"authorization\"", "cookie\"", "password\"", "raw_html", "rawhtml"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("forbidden %q", forbidden)
		}
	}
}
