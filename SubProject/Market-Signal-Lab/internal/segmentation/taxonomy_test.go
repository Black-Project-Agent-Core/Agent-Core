package segmentation

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestClassifySeparatesSurfaceCatalogProductTypeAndUseCase(t *testing.T) {
	got := Classify(Input{
		Site: "graphicriver.net", SourceCategory: "Presentation Templates / Sports",
		Title: "Padel Club Sponsorship Proposal", Surface: domain.MarketSurfacePopular,
	})
	if got.ContentType != "Graphics" || got.Catalog != "Presentation Templates" || got.Subcatalog != "Sports" {
		t.Fatalf("catalog result=%+v", got)
	}
	if got.ProductType != "presentation" || got.UseCase != "sponsorship proposal" {
		t.Fatalf("semantic result=%+v", got)
	}
	if got.Catalog == "Popular" || got.Catalog == "Random New" {
		t.Fatalf("surface leaked into catalog=%+v", got)
	}
	if got.Confidence < 80 || got.Status != domain.IntegrityStatusNativeAlpha65 {
		t.Fatalf("quality=%+v", got)
	}
}

func TestClassifyLowConfidenceUsesContentTypeRootAndNeedsReview(t *testing.T) {
	got := Classify(Input{Site: "graphicriver.net", Title: "Untitled Creative Asset", Surface: domain.MarketSurfaceNew})
	if got.ContentType != "Graphics" || got.Catalog != "" || got.Status != domain.IntegrityStatusNeedsReview {
		t.Fatalf("got=%+v", got)
	}
	if got.Confidence >= 50 {
		t.Fatalf("unexpected confidence=%v", got.Confidence)
	}
}
