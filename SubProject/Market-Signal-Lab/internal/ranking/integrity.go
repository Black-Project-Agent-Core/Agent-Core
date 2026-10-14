package ranking

import "marketsignallab/internal/domain"

func catalogIsExcluded(nodes []domain.CatalogNode, id string) bool {
	byID := map[string]domain.CatalogNode{}
	for _, n := range nodes {
		byID[n.ID] = n
	}
	seen := map[string]bool{}
	for id != "" && !seen[id] {
		seen[id] = true
		n, ok := byID[id]
		if !ok {
			return false
		}
		if n.ExcludedFromRanking || n.AnalyticalStatus == domain.IntegrityStatusExcluded || n.AnalyticalStatus == domain.IntegrityStatusNeedsReview {
			return true
		}
		id = n.ParentID
	}
	return false
}
