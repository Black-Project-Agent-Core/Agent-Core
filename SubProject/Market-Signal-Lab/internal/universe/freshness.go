package universe

import (
	"marketsignallab/internal/domain"
	"strings"
	"time"
)

func MetadataFreshness(now time.Time, m domain.LiveProductMetadata) string {
	if strings.Contains(m.SourceType, "manual") || m.SourceType == "external_csv" {
		return "IMPORTED SNAPSHOT"
	}
	fetched, ferr := time.Parse(time.RFC3339, m.FetchedAt)
	expires, eerr := time.Parse(time.RFC3339, m.ExpiresAt)
	if ferr != nil || eerr != nil {
		return "STALE — REFRESH REQUIRED"
	}
	if !now.Before(expires) {
		return "STALE — REFRESH REQUIRED"
	}
	ttl := expires.Sub(fetched)
	if ttl > 0 && now.Sub(fetched) <= ttl/4 {
		return "LIVE"
	}
	return "FRESH"
}
