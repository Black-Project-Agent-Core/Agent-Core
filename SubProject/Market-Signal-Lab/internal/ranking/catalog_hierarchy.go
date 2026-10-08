package ranking

import "marketsignallab/internal/domain"

type catalogHierarchy struct {
	parentByID map[string]string
}

func newCatalogHierarchy(nodes []domain.CatalogNode) catalogHierarchy {
	parents := make(map[string]string, len(nodes))
	for _, node := range nodes {
		if node.ID != "" {
			parents[node.ID] = node.ParentID
		}
	}
	return catalogHierarchy{parentByID: parents}
}

func (h catalogHierarchy) within(scopeID, candidateID string) bool {
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

func (h catalogHierarchy) intersects(leftID, rightID string) bool {
	return h.within(leftID, rightID) || h.within(rightID, leftID)
}
