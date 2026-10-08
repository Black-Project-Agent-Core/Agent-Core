package universe

import "marketsignallab/internal/domain"

type CatalogHierarchy struct {
	parentByID map[string]string
}

func NewCatalogHierarchy(nodes []domain.CatalogNode) CatalogHierarchy {
	parents := make(map[string]string, len(nodes))
	for _, node := range nodes {
		if node.ID != "" {
			parents[node.ID] = node.ParentID
		}
	}
	return CatalogHierarchy{parentByID: parents}
}

func (h CatalogHierarchy) within(scopeID, candidateID string) bool {
	if scopeID == "" || candidateID == "" {
		return false
	}
	if scopeID == candidateID {
		return true
	}
	current := candidateID
	for steps := 0; current != "" && steps <= len(h.parentByID); steps++ {
		parent, ok := h.parentByID[current]
		if !ok {
			return false
		}
		if parent == scopeID {
			return true
		}
		current = parent
	}
	return false
}

func (h CatalogHierarchy) ScopeIDs(scopeID string) (map[string]bool, bool) {
	if scopeID != "" {
		if _, ok := h.parentByID[scopeID]; !ok {
			return nil, false
		}
	}
	out := make(map[string]bool, len(h.parentByID))
	for candidateID := range h.parentByID {
		if scopeID == "" || h.within(scopeID, candidateID) {
			out[candidateID] = true
		}
	}
	return out, true
}
