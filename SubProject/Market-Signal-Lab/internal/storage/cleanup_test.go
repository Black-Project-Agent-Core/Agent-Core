package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"marketsignallab/internal/domain"
)

func writeJSONLRows(t *testing.T, path string, rows ...any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	enc := json.NewEncoder(f)
	for _, row := range rows {
		if err := enc.Encode(row); err != nil {
			_ = f.Close()
			t.Fatal(err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestLegacySyntheticCleanupMigrationRemovesDemoAndKeepsRealRows(t *testing.T) {
	root := t.TempDir()
	writeJSONLRows(t, filepath.Join(root, "history", "catalog_nodes.jsonl"),
		domain.CatalogNode{ID: "demo-sports", Platform: "Synthetic Demo", Name: "DEMO — Sports", CanonicalKey: "synthetic-demo/presentation/sports"},
		domain.CatalogNode{ID: "real-catalog", Platform: "Envato Market", Name: "Sports", CanonicalKey: "envato-market/presentation/sports"},
	)
	writeJSONLRows(t, filepath.Join(root, "history", "product_entities.jsonl"),
		domain.ProductEntity{ID: "demo-product-1", SourceType: "synthetic_demo", ExternalItemID: "demo-item-1", CanonicalCatalogID: "demo-sports"},
		domain.ProductEntity{ID: "real-product", SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: "real-catalog"},
	)
	st, report, err := OpenWithPurgeReport(root)
	if err != nil {
		t.Fatal(err)
	}
	if report.RemovedRecords != 2 {
		t.Fatalf("report=%+v", report)
	}
	catalogs, err := st.CatalogNodes()
	if err != nil {
		t.Fatal(err)
	}
	if len(catalogs) != 1 || catalogs[0].ID != "real-catalog" {
		t.Fatalf("catalogs=%+v", catalogs)
	}
	products, err := st.Products()
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 || products[0].ID != "real-product" {
		t.Fatalf("products=%+v", products)
	}
	marker := filepath.Join(root, "config", "migrations", migrationLegacySyntheticCleanupV1+".done")
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("migration marker missing: %v", err)
	}
}

func TestLegacySyntheticCleanupMigrationRunsOnlyOnce(t *testing.T) {
	root := t.TempDir()
	writeJSONLRows(t, filepath.Join(root, "history", "catalog_nodes.jsonl"), domain.CatalogNode{ID: "demo-one", Platform: "Synthetic Demo", Name: "DEMO — One", CanonicalKey: "synthetic-demo/one"})
	st, first, err := OpenWithPurgeReport(root)
	if err != nil {
		t.Fatal(err)
	}
	if first.RemovedRecords != 1 {
		t.Fatalf("first=%+v", first)
	}
	writeJSONLRows(t, filepath.Join(root, "history", "catalog_nodes.jsonl"), domain.CatalogNode{ID: "demo-late", Platform: "Synthetic Demo", Name: "DEMO — Late", CanonicalKey: "synthetic-demo/late"})
	second, err := st.RunMigrations()
	if err != nil {
		t.Fatal(err)
	}
	if second.RemovedRecords != 0 || second.FilesRewritten != 0 {
		t.Fatalf("migration reran: %+v", second)
	}
}

func TestLegacySyntheticCleanupPreservesExactRealResearch(t *testing.T) {
	root := t.TempDir()
	realID := "real-identity"
	writeJSONLRows(t, filepath.Join(root, "history", "identities.jsonl"), domain.MarketIdentity{ID: realID, Theme: "Fashion", ProductType: "Magazine Template", SubNiche: "Lookbook"})
	writeJSONLRows(t, filepath.Join(root, "history", "analyses.jsonl"), domain.Analysis{ID: "real-analysis", IdentityID: realID, Opportunity: 75, ModelVersion: "0.1.0-preview"})
	st, _, err := OpenWithPurgeReport(root)
	if err != nil {
		t.Fatal(err)
	}
	ids, err := st.Identities()
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0].ID != realID {
		t.Fatalf("ids=%+v", ids)
	}
	b, err := os.ReadFile(filepath.Join(root, "history", "analyses.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "real-analysis") {
		t.Fatalf("real analysis removed: %s", b)
	}
}
