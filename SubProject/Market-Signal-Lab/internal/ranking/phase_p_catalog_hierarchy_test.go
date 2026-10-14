package ranking

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestCatalogHierarchyMatchesExpectedContainment(t *testing.T) {
	nodes := []domain.CatalogNode{
		{ID: "root"},
		{ID: "catalog", ParentID: "root"},
		{ID: "sub", ParentID: "catalog"},
		{ID: "leaf", ParentID: "sub"},
		{ID: "other", ParentID: "root"},
		{ID: "orphan", ParentID: "ghost"},
	}
	h := newCatalogHierarchy(nodes)
	cases := []struct {
		scope, candidate string
		want             bool
	}{
		{"root", "root", true},
		{"root", "leaf", true},
		{"catalog", "leaf", true},
		{"sub", "leaf", true},
		{"leaf", "root", false},
		{"catalog", "other", false},
		{"missing", "leaf", false},
		{"missing", "missing", true},
		{"ghost", "orphan", true},
		{"root", "missing", false},
		{"", "leaf", false},
	}
	for _, tc := range cases {
		if got := h.within(tc.scope, tc.candidate); got != tc.want {
			t.Fatalf("within(%q,%q)=%v want=%v", tc.scope, tc.candidate, got, tc.want)
		}
	}
}

func TestCatalogHierarchyIntersectsBothDirections(t *testing.T) {
	nodes := []domain.CatalogNode{
		{ID: "root"},
		{ID: "child", ParentID: "root"},
		{ID: "leaf", ParentID: "child"},
		{ID: "sibling", ParentID: "root"},
	}
	h := newCatalogHierarchy(nodes)
	if !h.intersects("root", "leaf") || !h.intersects("leaf", "root") {
		t.Fatal("ancestor/descendant relationship must intersect in either argument order")
	}
	if h.intersects("leaf", "sibling") {
		t.Fatal("unrelated catalog branches must not intersect")
	}
}
