package app

import (
	"context"
	"sort"
	"strings"

	"marketsignallab/internal/domain"
)

// enrichOfficialReleases uses only the remaining bounded request allowance.
// Missing or unsupported upstream release fields remain unavailable; scan time
// is never substituted for a release date.
func (s *Service) enrichOfficialReleases(ctx context.Context, token string, productIDs []string, allowance int) int {
	if allowance <= 0 || len(productIDs) == 0 {
		return 0
	}
	products, err := s.universe.Products()
	if err != nil {
		return 0
	}
	byID := make(map[string]domain.ProductEntity, len(products))
	for _, product := range products {
		byID[product.ID] = product
	}
	ids := append([]string(nil), productIDs...)
	sort.Strings(ids)
	used := 0
	for _, productID := range ids {
		if used >= allowance {
			break
		}
		if _, ok, err := s.universe.ProductRelease(productID); err != nil || ok {
			continue
		}
		product, ok := byID[productID]
		if !ok || product.SourceType != "envato_market_api" || strings.TrimSpace(product.ExternalItemID) == "" {
			continue
		}
		detail, err := s.envato.ItemDetail(ctx, token, product.ExternalItemID, allowance-used)
		used += detail.HTTPRequests
		if err != nil || strings.TrimSpace(detail.ReleasedAt) == "" || strings.TrimSpace(detail.ReleaseField) == "" {
			continue
		}
		sourceURL := detail.SourceURL
		if sourceURL == "" {
			if meta, has, _ := s.universe.LatestLiveProductMetadata(productID); has {
				sourceURL = meta.SourceURL
			}
		}
		_, _, _ = s.universe.UpsertProductRelease(domain.ProductReleaseRecord{
			ProductID: productID, ReleasedAt: detail.ReleasedAt,
			Precision:  domain.ReleasePrecision(detail.ReleasePrecision),
			SourceType: "envato_market_api", SourceField: detail.ReleaseField,
			SourceURL: sourceURL, VerifiedAt: detail.ObservedAt,
		})
	}
	return used
}
