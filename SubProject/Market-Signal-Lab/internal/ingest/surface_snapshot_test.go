package ingest

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func validCapturePayload() domain.SurfaceCapturePayload {
	return domain.SurfaceCapturePayload{
		Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30, ContextLabel: "Edge Public"},
		PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test-v1",
		Items: []domain.SurfaceCaptureItem{{Rank: 1, ExternalItemID: "item-a", SourceURL: "https://elements.envato.com/example-a-XYZ789", Title: "A"}},
	}
}

func TestBuildSurfaceSnapshotNormalizesVisibleTopKOnly(t *testing.T) {
	payload := domain.SurfaceCapturePayload{
		Context:       domain.ObservationContextInput{Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30, ContextLabel: "Edge Public"},
		PageURL:       "https://elements.envato.com/graphic-templates",
		Items:         []domain.SurfaceCaptureItem{{Rank: 2, ExternalItemID: "item-b", SourceURL: "https://elements.envato.com/example-b-ABC123", Title: "B"}, {Rank: 1, ExternalItemID: "item-a", SourceURL: "https://elements.envato.com/example-a-XYZ789", Title: "A"}},
		CaptureStatus: "complete", TopKRequested: 30,
	}
	ctx, snapshot, items, audit, err := BuildSurfaceSnapshot(payload, time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.TopKObserved != 2 || items[0].Rank != 1 || items[1].Rank != 2 {
		t.Fatalf("snapshot=%+v items=%+v", snapshot, items)
	}
	if snapshot.Coverage != 100.0*2.0/30.0 {
		t.Fatalf("coverage=%v", snapshot.Coverage)
	}
	if audit.Accepted != true || ctx.SourceSite != "elements.envato.com" {
		t.Fatalf("ctx=%+v audit=%+v", ctx, audit)
	}
}

func TestMissingIDUsesCanonicalURLWithLowerIdentityConfidence(t *testing.T) {
	payload := validCapturePayload()
	payload.Items[0].ExternalItemID = ""
	_, _, items, _, err := BuildSurfaceSnapshot(payload, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if items[0].IdentityConfidence >= 1 || items[0].CanonicalIdentityKey == "" {
		t.Fatalf("item=%+v", items[0])
	}
}

func TestRawHTMLOrPrivateFieldsAreRejected(t *testing.T) {
	payload := validCapturePayload()
	payload.RawHTML = "<html>secret</html>"
	if _, _, _, _, err := BuildSurfaceSnapshot(payload, time.Now().UTC()); err == nil {
		t.Fatal("raw HTML must be rejected")
	}
}
