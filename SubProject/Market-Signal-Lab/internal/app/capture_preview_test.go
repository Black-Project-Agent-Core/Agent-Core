package app

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

type fakeCaptureClock struct{ now time.Time }

func (c *fakeCaptureClock) Now() time.Time          { return c.now }
func (c *fakeCaptureClock) Advance(d time.Duration) { c.now = c.now.Add(d) }

func validPreviewCapturePayload() domain.SurfaceCapturePayload {
	return domain.SurfaceCapturePayload{
		Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "user_initiated_page_capture", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30, ContextLabel: "Public"},
		PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test",
		Items: []domain.SurfaceCaptureItem{{Rank: 1, ExternalItemID: "ABC123", SourceURL: "https://elements.envato.com/example-ABC123", Title: "Example"}},
	}
}

func TestPendingCaptureExpiresAndIsNotPersistedBeforeConfirm(t *testing.T) {
	clock := &fakeCaptureClock{now: time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)}
	previews := NewCapturePreviewStore(clock.Now, 15*time.Minute)
	id, err := previews.Put(validPreviewCapturePayload())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := previews.Get(id); !ok {
		t.Fatal("preview missing")
	}
	clock.Advance(16 * time.Minute)
	if _, ok := previews.Get(id); ok {
		t.Fatal("expired preview remained")
	}
}
