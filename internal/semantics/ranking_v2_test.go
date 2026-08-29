package semantics

import (
	"testing"

	"marketsignallab/internal/domain"
)

func TestProjectProductV2CopiesLegacyValuesExactly(t *testing.T) {
	legacy := domain.ProductSnapshot{RelativeStrength: 73.4, OpportunityScore: 68.2}
	got, err := ProjectProduct(ContractVersionV2, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if got.Contract.Version != ContractVersionV2 || got.PeerRelativeRank != 73.4 || got.ProductInsightScore != 68.2 {
		t.Fatalf("projection=%+v", got)
	}
}

func TestProjectCatalogV2CopiesAllLegacyValuesExactly(t *testing.T) {
	legacy := domain.CatalogSnapshot{
		ExposureBreadth: 61.5, NewSupplyVelocityPercent: 22.2,
		NewSupplyVelocityIndex: 64.3, CompetitionAcceleration: -11.4,
		RelativeStrength: 81.1, OpportunityScore: 70.7,
	}
	got, err := ProjectCatalog(ContractVersionV2, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if got.DirectionalBreadth != 61.5 || got.ObservedNewSupplyGrowthPercent != 22.2 ||
		got.ObservedNewSupplyMomentumIndex != 64.3 || got.CompetitionMomentumPercent != -11.4 ||
		got.PeerRelativeRank != 81.1 || got.CatalogInsightScore != 70.7 {
		t.Fatalf("projection=%+v", got)
	}
}

func TestProjectorsRejectUnknownSemanticContract(t *testing.T) {
	if _, err := ProjectProduct("msl-semantic-contract/999", domain.ProductSnapshot{}); err == nil {
		t.Fatal("expected unsupported semantic contract error")
	}
}
