package ranking

import (
	"marketsignallab/internal/domain"
	"time"
)

func catalogExists(nodes []domain.CatalogNode, id string) bool {
	for _, node := range nodes {
		if node.ID == id {
			return true
		}
	}
	return false
}

func productInScope(h catalogHierarchy, scopeID, catalogID string) bool {
	if scopeID == "" {
		return true
	}
	return h.within(scopeID, catalogID)
}

func segmentationByObservation(dataset Dataset) map[string]domain.ObservationSegmentation {
	out := map[string]domain.ObservationSegmentation{}
	for _, row := range dataset.Segmentations {
		if existing, ok := out[row.ObservationID]; !ok || row.GeneratedAt > existing.GeneratedAt {
			out[row.ObservationID] = row
		}
	}
	return out
}

func observationCatalog(dataset Dataset, obs domain.ProductObservation, products map[string]domain.ProductEntity, segments map[string]domain.ObservationSegmentation) (string, bool) {
	if seg, ok := segments[obs.ID]; ok && seg.CatalogID != "" && (seg.Status == domain.IntegrityStatusNativeAlpha65 || seg.Status == domain.IntegrityStatusRecalculated) {
		return seg.CatalogID, false
	}
	if obs.CatalogID != "" {
		return obs.CatalogID, true
	}
	if p, ok := products[obs.ProductID]; ok {
		return p.CanonicalCatalogID, true
	}
	return "", true
}

func applicableQueries(dataset Dataset, h catalogHierarchy, product domain.ProductEntity) map[string]struct{} {
	out := map[string]struct{}{}
	for _, query := range dataset.Queries {
		if !query.Enabled || query.CatalogScopeID == "" {
			continue
		}
		if h.within(query.CatalogScopeID, product.CanonicalCatalogID) {
			out[query.ID] = struct{}{}
		}
	}
	return out
}

func sessionIntersectsCurrent(session domain.ResearchSession, w domain.RankingWindow) bool {
	start, ok := parseTimestamp(session.StartedAt)
	if !ok {
		return false
	}
	end := start
	if session.CompletedAt != "" {
		if parsedEnd, ok := parseTimestamp(session.CompletedAt); ok {
			end = parsedEnd
		}
	}
	windowStart, errStart := time.Parse(time.RFC3339, w.CurrentStart)
	windowEnd, errEnd := time.Parse(time.RFC3339, w.CurrentEnd)
	if errStart != nil || errEnd != nil {
		return false
	}
	return !start.After(windowEnd) && !end.Before(windowStart)
}

func observationCatalogID(observation domain.ProductObservation, products map[string]domain.ProductEntity, segments map[string]domain.ObservationSegmentation) string {
	if seg, ok := segments[observation.ID]; ok && seg.CatalogID != "" && (seg.Status == domain.IntegrityStatusNativeAlpha65 || seg.Status == domain.IntegrityStatusRecalculated) {
		return seg.CatalogID
	}
	if observation.CatalogID != "" {
		return observation.CatalogID
	}
	if product, ok := products[observation.ProductID]; ok {
		return product.CanonicalCatalogID
	}
	return ""
}

func intersectsCatalogScope(h catalogHierarchy, catalogID, queryScopeID string) bool {
	if catalogID == "" || queryScopeID == "" {
		return false
	}
	return h.intersects(catalogID, queryScopeID)
}

func sessionIntersectsWindow(session domain.ResearchSession, startRaw, endRaw string) bool {
	start, ok := parseTimestamp(session.StartedAt)
	if !ok {
		return false
	}
	end := start
	if session.CompletedAt != "" {
		if parsed, ok := parseTimestamp(session.CompletedAt); ok {
			end = parsed
		}
	}
	windowStart, errStart := time.Parse(time.RFC3339, startRaw)
	windowEnd, errEnd := time.Parse(time.RFC3339, endRaw)
	if errStart != nil || errEnd != nil {
		return false
	}
	return !start.After(windowEnd) && !end.Before(windowStart)
}

func relevantCatalogSession(dataset Dataset, h catalogHierarchy, catalogID string, session domain.ResearchSession) bool {
	if session.Scope != "" && h.within(catalogID, session.Scope) {
		return true
	}
	queryByID := map[string]domain.ResearchQuery{}
	for _, query := range dataset.Queries {
		queryByID[query.ID] = query
	}
	for _, queryID := range session.QueryIDs {
		if query, ok := queryByID[queryID]; ok && intersectsCatalogScope(h, catalogID, query.CatalogScopeID) {
			return true
		}
	}
	return false
}

func completedQueryCount(dataset Dataset, h catalogHierarchy, catalogID, startRaw, endRaw string) int {
	completed := map[string]struct{}{}
	fallback := 0
	for _, session := range dataset.Sessions {
		if session.Status == domain.ResearchSessionFailed || session.Status == domain.ResearchSessionCancelled {
			continue
		}
		if !relevantCatalogSession(dataset, h, catalogID, session) || !sessionIntersectsWindow(session, startRaw, endRaw) {
			continue
		}
		ids := session.CompletedQueryIDs
		if len(ids) == 0 && session.Status == domain.ResearchSessionCompleted {
			ids = session.QueryIDs
		}
		for _, id := range ids {
			if id != "" {
				completed[id] = struct{}{}
			}
		}
		if session.QueriesCompleted > fallback {
			fallback = session.QueriesCompleted
		}
	}
	if len(completed) > fallback {
		return len(completed)
	}
	return fallback
}

func catalogApplicableQueryCount(dataset Dataset, h catalogHierarchy, catalogID string) int {
	seen := map[string]struct{}{}
	for _, query := range dataset.Queries {
		if query.Enabled && intersectsCatalogScope(h, catalogID, query.CatalogScopeID) {
			seen[query.ID] = struct{}{}
		}
	}
	return len(seen)
}
