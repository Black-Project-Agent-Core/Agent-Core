package semantics_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/semantics"
	"marketsignallab/internal/storage"
)

func readHistory(t *testing.T, root, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(root, "history", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSemanticProjectionPersistenceLeavesLegacyJSONLUntouched(t *testing.T) {
	root := t.TempDir()
	store, err := storage.Open(root)
	if err != nil {
		t.Fatal(err)
	}

	product := domain.ProductSnapshot{
		ID:               "ps-1",
		ProductID:        "prod-1",
		CatalogID:        "cat-1",
		Window:           domain.RankingWindow{Days: 7, CurrentEnd: "2026-08-21"},
		ObservedAt:       "2026-08-21T00:00:00Z",
		RelativeStrength: 0.42,
		OpportunityScore: 71.5,
		ModelVersion:     "v0.1",
	}
	catalog := domain.CatalogSnapshot{
		ID:                       "cs-1",
		CatalogID:                "cat-1",
		Window:                   domain.RankingWindow{Days: 7, CurrentEnd: "2026-08-21"},
		ObservedAt:               "2026-08-21T00:00:00Z",
		ExposureBreadth:          0.6,
		NewSupplyVelocityPercent: 12.5,
		NewSupplyVelocityIndex:   1.1,
		CompetitionAcceleration:  0.3,
		RelativeStrength:         0.55,
		OpportunityScore:         64.0,
		ModelVersion:             "v0.1",
	}

	if err := store.AppendProductSnapshot(product); err != nil {
		t.Fatal(err)
	}
	if err := store.AppendCatalogSnapshot(catalog); err != nil {
		t.Fatal(err)
	}

	productBefore := readHistory(t, root, "product_snapshots.jsonl")
	catalogBefore := readHistory(t, root, "catalog_snapshots.jsonl")

	products, err := store.ProductSnapshots(domain.ProductSnapshotFilter{})
	if err != nil {
		t.Fatal(err)
	}
	catalogs, err := store.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 || len(catalogs) != 1 {
		t.Fatalf("expected 1 product and 1 catalog snapshot, got %d and %d", len(products), len(catalogs))
	}

	for _, row := range products {
		if _, err := semantics.ProjectProduct(semantics.ContractVersionV2, row); err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range catalogs {
		if _, err := semantics.ProjectCatalog(semantics.ContractVersionV2, row); err != nil {
			t.Fatal(err)
		}
	}

	productAfter := readHistory(t, root, "product_snapshots.jsonl")
	catalogAfter := readHistory(t, root, "catalog_snapshots.jsonl")

	if !bytes.Equal(productBefore, productAfter) {
		t.Error("semantic projection mutated product_snapshots.jsonl")
	}
	if !bytes.Equal(catalogBefore, catalogAfter) {
		t.Error("semantic projection mutated catalog_snapshots.jsonl")
	}
}
