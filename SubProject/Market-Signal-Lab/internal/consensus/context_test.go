package consensus

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func contains(xs []string, target string) bool {
	for _, x := range xs {
		if x == target {
			return true
		}
	}
	return false
}

func contextFixture(experience, access, captured string, topK int) domain.ObservationContext {
	return domain.ObservationContext{
		ID: domain.NewID(), ContextKey: "fixture", Platform: domain.ObservationPlatformSubscription,
		Experience: domain.ObservationExperience(experience), AccessState: domain.ObservationAccessState(access),
		SourceMethod: domain.ObservationSourcePageCapture, SourceSite: "elements.envato.com",
		CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular",
		FilterHash: FilterHash(nil), Locale: "en", CountryOrRegion: "id", PageSizeOrTopK: topK,
		CapturedAt: captured, ContextVersion: "observation-context-v0.1",
	}
}

func TestCanonicalizeContextSortsFiltersAndBuildsStableKey(t *testing.T) {
	now := time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)
	first, err := CanonicalizeContext(domain.ObservationContextInput{
		Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous",
		SourceMethod: "user_initiated_page_capture", SourceSite: "elements.envato.com",
		CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular",
		Filters: []domain.ContextFilter{{Name: "orientation", Values: []string{"portrait", "landscape"}}, {Name: "category", Values: []string{"mockups"}}},
		Locale:  "en", CountryOrRegion: "ID", PageSizeOrTopK: 30, ContextLabel: "Edge Public",
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CanonicalizeContext(domain.ObservationContextInput{
		Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous",
		SourceMethod: "user_initiated_page_capture", SourceSite: "elements.envato.com",
		CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular",
		Filters: []domain.ContextFilter{{Name: "category", Values: []string{"mockups"}}, {Name: "orientation", Values: []string{"landscape", "portrait"}}},
		Locale:  "en", CountryOrRegion: "id", PageSizeOrTopK: 30, ContextLabel: "Another Label",
	}, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if first.ContextKey != second.ContextKey {
		t.Fatalf("keys differ: %s %s", first.ContextKey, second.ContextKey)
	}
	if first.FilterHash != second.FilterHash {
		t.Fatalf("filter hashes differ")
	}
}

func TestPairComparabilityRequiresDifferentExperienceAndMatchingMarketDimensions(t *testing.T) {
	a := contextFixture("public_web", "anonymous", "2026-08-16T10:00:00Z", 30)
	b := contextFixture("subscriber_app", "active_subscriber", "2026-08-16T10:07:00Z", 30)
	got := ComparePairContexts(a, b, 10*time.Minute)
	if !got.Comparable {
		t.Fatalf("expected comparable: %+v", got)
	}
	b.SortMode = "new"
	got = ComparePairContexts(a, b, 10*time.Minute)
	if got.Comparable || !contains(got.ReasonCodes, "sort_mode_mismatch") {
		t.Fatalf("unexpected %+v", got)
	}
}

func TestPairOutsideToleranceIsStoredButNotComparable(t *testing.T) {
	a := contextFixture("public_web", "anonymous", "2026-08-16T10:00:00Z", 30)
	b := contextFixture("subscriber_app", "active_subscriber", "2026-08-16T10:31:00Z", 30)
	got := ComparePairContexts(a, b, 10*time.Minute)
	if got.Comparable || !contains(got.ReasonCodes, "capture_time_tolerance_exceeded") {
		t.Fatalf("unexpected %+v", got)
	}
}
