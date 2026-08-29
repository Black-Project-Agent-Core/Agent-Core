package universe

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func TestMetadataFreshnessSeparatesImportedLiveFreshAndStale(t *testing.T) {
	now := time.Date(2026, 8, 15, 4, 0, 0, 0, time.UTC)
	if got := MetadataFreshness(now, domain.LiveProductMetadata{SourceType: "envato_elements_manual", FetchedAt: now.Add(-24 * time.Hour).Format(time.RFC3339)}); got != "IMPORTED SNAPSHOT" {
		t.Fatalf("got=%s", got)
	}
	if got := MetadataFreshness(now, domain.LiveProductMetadata{SourceType: "envato_market_api", FetchedAt: now.Add(-time.Hour).Format(time.RFC3339), ExpiresAt: now.Add(23 * time.Hour).Format(time.RFC3339)}); got != "LIVE" {
		t.Fatalf("got=%s", got)
	}
	if got := MetadataFreshness(now, domain.LiveProductMetadata{SourceType: "envato_market_api", FetchedAt: now.Add(-12 * time.Hour).Format(time.RFC3339), ExpiresAt: now.Add(12 * time.Hour).Format(time.RFC3339)}); got != "FRESH" {
		t.Fatalf("got=%s", got)
	}
	if got := MetadataFreshness(now, domain.LiveProductMetadata{SourceType: "envato_market_api", FetchedAt: now.Add(-48 * time.Hour).Format(time.RFC3339), ExpiresAt: now.Add(-24 * time.Hour).Format(time.RFC3339)}); got != "STALE — REFRESH REQUIRED" {
		t.Fatalf("got=%s", got)
	}
}
