package universe

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestBuildCatalogPathCreatesDeterministicHierarchy(t *testing.T) {
	got, err := BuildCatalogPath(domain.CatalogPathInput{
		Platform:     "Envato Elements",
		ContentType:  "Presentation",
		Catalog:      "Sports",
		Subcatalog:   "Padel",
		Niche:        "Club Sponsorship",
		UseCase:      "Partnership Proposal",
		StyleCluster: "Editorial Sports",
	}, "2026-08-15T04:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 6 {
		t.Fatalf("nodes=%d want 6", len(got))
	}
	if got[0].Level != domain.CatalogLevelContentType || got[0].CanonicalKey != "envato-elements/content_type:presentation" {
		t.Fatalf("content type=%+v", got[0])
	}
	if got[len(got)-1].CanonicalKey != "envato-elements/content_type:presentation/catalog:sports/subcatalog:padel/niche:club-sponsorship/use_case:partnership-proposal/style_cluster:editorial-sports" {
		t.Fatalf("leaf=%s", got[len(got)-1].CanonicalKey)
	}
	if !IsCatalogWithin(got, got[1].ID, got[len(got)-1].ID) {
		t.Fatal("leaf should be inside Sports scope")
	}
	if IsCatalogWithin(got, got[len(got)-1].ID, got[1].ID) {
		t.Fatal("parent must not be inside leaf scope")
	}
}

func TestBuildCatalogPathRejectsMissingPlatformOrContentType(t *testing.T) {
	if _, err := BuildCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements"}, "2026-08-15T04:00:00Z"); err == nil {
		t.Fatal("expected missing content type error")
	}
}

func TestBuildCatalogPathRejectsScannerSurfaceAsCatalog(t *testing.T) {
	_, err := BuildCatalogPath(domain.CatalogPathInput{
		Platform: "Envato Market", ContentType: "Graphics", Catalog: "Random New",
		Origin: domain.CatalogOriginScanner, SourceSurface: domain.MarketSurfaceRandomNew,
	}, "2026-08-16T00:00:00Z")
	if err == nil {
		t.Fatal("scanner surface must not become a catalog")
	}
}

func TestBuildCatalogPathAllowsManualPopularCulture(t *testing.T) {
	got, err := BuildCatalogPath(domain.CatalogPathInput{
		Platform: "Manual Research", ContentType: "Editorial", Catalog: "Popular Culture",
		Origin: domain.CatalogOriginManual,
	}, "2026-08-16T00:00:00Z")
	if err != nil || len(got) != 2 {
		t.Fatalf("got=%+v err=%v", got, err)
	}
}
