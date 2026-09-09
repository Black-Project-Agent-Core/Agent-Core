package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/security"
	"sort"
	"strings"
	"time"
)

func NormalizeContextFilters(filters []domain.ContextFilter) []domain.ContextFilter {
	out := make([]domain.ContextFilter, 0, len(filters))
	for _, f := range filters {
		name := strings.ToLower(strings.TrimSpace(f.Name))
		if name == "" {
			continue
		}
		seen := map[string]bool{}
		vals := make([]string, 0, len(f.Values))
		for _, v := range f.Values {
			v = strings.ToLower(strings.TrimSpace(v))
			if v == "" || seen[v] {
				continue
			}
			seen[v] = true
			vals = append(vals, v)
		}
		sort.Strings(vals)
		out = append(out, domain.ContextFilter{Name: name, Values: vals})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func FilterHash(filters []domain.ContextFilter) string {
	normalized := NormalizeContextFilters(filters)
	b, _ := json.Marshal(normalized)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func ContextKey(c domain.ObservationContext) string {
	parts := []string{
		string(c.Platform), string(c.Experience), string(c.AccessState), string(c.SourceMethod),
		strings.ToLower(c.SourceSite), c.CatalogPath, strings.ToLower(c.ContentType), strings.ToLower(c.SortMode),
		c.FilterHash, strings.ToLower(c.Locale), strings.ToLower(c.CountryOrRegion), fmt.Sprintf("%d", c.PageSizeOrTopK), c.ContextVersion,
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(sum[:])
}

func CanonicalizeContext(input domain.ObservationContextInput, now time.Time) (domain.ObservationContext, error) {
	platform := domain.ObservationPlatform(strings.ToLower(strings.TrimSpace(string(input.Platform))))
	experience := domain.ObservationExperience(strings.ToLower(strings.TrimSpace(string(input.Experience))))
	access := domain.ObservationAccessState(strings.ToLower(strings.TrimSpace(string(input.AccessState))))
	method := domain.ObservationSourceMethod(strings.ToLower(strings.TrimSpace(string(input.SourceMethod))))
	if !validPlatform(platform) || !validExperience(experience) || !validAccess(access) || !validSourceMethod(method) {
		return domain.ObservationContext{}, errors.New("unsupported observation context enum")
	}
	host := strings.ToLower(strings.TrimSpace(input.SourceSite))
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimSuffix(host, "/")
	path := strings.TrimSpace(input.CatalogPath)
	if path == "" || strings.TrimSpace(input.SortMode) == "" || strings.TrimSpace(input.Locale) == "" {
		return domain.ObservationContext{}, errors.New("catalog, sort mode, and locale are required")
	}
	if input.PageSizeOrTopK < 1 || input.PageSizeOrTopK > 200 {
		return domain.ObservationContext{}, errors.New("top-k must be between 1 and 200")
	}
	canonicalPage, ok := security.SanitizeEnvatoPageURL("https://" + host + ensureLeadingSlash(path))
	if !ok {
		return domain.ObservationContext{}, errors.New("unsupported Envato host or catalog path")
	}
	host, path = security.SplitEnvatoPageURL(canonicalPage)
	filters := NormalizeContextFilters(input.Filters)
	ctx := domain.ObservationContext{
		ID: domain.NewID(), Platform: platform, Experience: experience, AccessState: access, SourceMethod: method,
		SourceSite: host, CatalogPath: path, ContentType: strings.ToLower(strings.TrimSpace(input.ContentType)),
		SortMode: strings.ToLower(strings.TrimSpace(input.SortMode)), Filters: filters, FilterHash: FilterHash(filters),
		Locale: strings.ToLower(strings.TrimSpace(input.Locale)), CountryOrRegion: strings.ToLower(strings.TrimSpace(input.CountryOrRegion)),
		Currency: strings.ToLower(strings.TrimSpace(input.Currency)), PageSizeOrTopK: input.PageSizeOrTopK,
		CapturedAt: now.UTC().Format(time.RFC3339), ContextLabel: strings.TrimSpace(input.ContextLabel), ContextVersion: strings.TrimSpace(input.ContextVersion),
	}
	if ctx.ContextVersion == "" {
		ctx.ContextVersion = "observation-context-v0.1"
	}
	ctx.ContextKey = ContextKey(ctx)
	return ctx, nil
}

func ComparePairContexts(a, b domain.ObservationContext, tolerance time.Duration) domain.ComparabilityResult {
	result := domain.ComparabilityResult{ModelVersion: "paired-comparability-v0.1", CommonTopK: minInt(a.PageSizeOrTopK, b.PageSizeOrTopK)}
	check := func(ok bool, code string) {
		if !ok {
			result.ReasonCodes = append(result.ReasonCodes, code)
		}
	}
	check(a.Platform == b.Platform, "platform_mismatch")
	check(a.CatalogPath == b.CatalogPath, "catalog_path_mismatch")
	check(a.ContentType == b.ContentType, "content_type_mismatch")
	check(a.SortMode == b.SortMode, "sort_mode_mismatch")
	check(a.FilterHash == b.FilterHash, "filter_mismatch")
	check(a.Locale == b.Locale, "locale_mismatch")
	check(a.CountryOrRegion == b.CountryOrRegion, "region_mismatch")
	check(a.ContextVersion == b.ContextVersion, "context_version_mismatch")
	check(a.Experience != b.Experience || a.AccessState != b.AccessState, "same_context_type")
	at, aerr := time.Parse(time.RFC3339, a.CapturedAt)
	bt, berr := time.Parse(time.RFC3339, b.CapturedAt)
	if aerr != nil || berr != nil || absDuration(at.Sub(bt)) > tolerance {
		result.ReasonCodes = append(result.ReasonCodes, "capture_time_tolerance_exceeded")
	}
	result.TruncatedA = a.PageSizeOrTopK > result.CommonTopK
	result.TruncatedB = b.PageSizeOrTopK > result.CommonTopK
	result.Comparable = len(result.ReasonCodes) == 0 && result.CommonTopK > 0
	return result
}

func CompareTemporalContexts(a, b domain.ObservationContext) domain.ComparabilityResult {
	result := domain.ComparabilityResult{ModelVersion: "paired-comparability-v0.1", CommonTopK: minInt(a.PageSizeOrTopK, b.PageSizeOrTopK)}
	check := func(ok bool, code string) {
		if !ok {
			result.ReasonCodes = append(result.ReasonCodes, code)
		}
	}
	check(a.Platform == b.Platform, "platform_mismatch")
	check(a.Experience == b.Experience, "experience_mismatch")
	check(a.AccessState == b.AccessState, "access_state_mismatch")
	check(a.SourceMethod == b.SourceMethod, "source_method_mismatch")
	check(a.SourceSite == b.SourceSite, "source_site_mismatch")
	check(a.CatalogPath == b.CatalogPath, "catalog_path_mismatch")
	check(a.ContentType == b.ContentType, "content_type_mismatch")
	check(a.SortMode == b.SortMode, "sort_mode_mismatch")
	check(a.FilterHash == b.FilterHash, "filter_mismatch")
	check(a.Locale == b.Locale, "locale_mismatch")
	check(a.CountryOrRegion == b.CountryOrRegion, "region_mismatch")
	check(a.ContextVersion == b.ContextVersion, "context_version_mismatch")
	result.TruncatedA = a.PageSizeOrTopK > result.CommonTopK
	result.TruncatedB = b.PageSizeOrTopK > result.CommonTopK
	result.Comparable = len(result.ReasonCodes) == 0 && result.CommonTopK > 0
	return result
}

func ensureLeadingSlash(s string) string {
	if strings.HasPrefix(s, "/") {
		return s
	}
	return "/" + s
}
func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func validPlatform(v domain.ObservationPlatform) bool {
	return v == domain.ObservationPlatformSubscription || v == domain.ObservationPlatformMarket || v == domain.ObservationPlatformBenchmark
}
func validExperience(v domain.ObservationExperience) bool {
	switch v {
	case domain.ObservationExperiencePublic, domain.ObservationExperienceSubscriber, domain.ObservationExperienceAPI, domain.ObservationExperienceContentOpportunities, domain.ObservationExperienceAdvancedResearch, domain.ObservationExperienceManual:
		return true
	}
	return false
}
func validAccess(v domain.ObservationAccessState) bool {
	switch v {
	case domain.ObservationAccessAnonymous, domain.ObservationAccessFree, domain.ObservationAccessSubscriber, domain.ObservationAccessToken, domain.ObservationAccessBenchmark:
		return true
	}
	return false
}
func validSourceMethod(v domain.ObservationSourceMethod) bool {
	switch v {
	case domain.ObservationSourceOfficialAPI, domain.ObservationSourcePageCapture, domain.ObservationSourceClipboard, domain.ObservationSourceCSV, domain.ObservationSourceManual:
		return true
	}
	return false
}
