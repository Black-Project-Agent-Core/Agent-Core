package universe

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestCatalogHierarchyScopeIDs(t *testing.T) {
	nodes := []domain.CatalogNode{
		{ID: "root"},
		{ID: "catalog", ParentID: "root"},
		{ID: "leaf", ParentID: "catalog"},
		{ID: "other", ParentID: "root"},
		{ID: "orphan", ParentID: "ghost"},
	}
	h := NewCatalogHierarchy(nodes)
	root, ok := h.ScopeIDs("root")
	if !ok || len(root) != 4 || !root["root"] || !root["catalog"] || !root["leaf"] || !root["other"] {
		t.Fatalf("root scope=%v ok=%v", root, ok)
	}
	catalog, ok := h.ScopeIDs("catalog")
	if !ok || len(catalog) != 2 || !catalog["catalog"] || !catalog["leaf"] {
		t.Fatalf("catalog scope=%v ok=%v", catalog, ok)
	}
	orphan, ok := h.ScopeIDs("orphan")
	if !ok || len(orphan) != 1 || !orphan["orphan"] {
		t.Fatalf("orphan scope=%v ok=%v", orphan, ok)
	}
	all, ok := h.ScopeIDs("")
	if !ok || len(all) != len(nodes) {
		t.Fatalf("all scope=%v ok=%v", all, ok)
	}
	if missing, ok := h.ScopeIDs("missing"); ok || missing != nil {
		t.Fatalf("missing scope=%v ok=%v", missing, ok)
	}
	root["mutated"] = true
	again, _ := h.ScopeIDs("root")
	if again["mutated"] {
		t.Fatal("scope result leaked caller mutation into hierarchy")
	}
}
