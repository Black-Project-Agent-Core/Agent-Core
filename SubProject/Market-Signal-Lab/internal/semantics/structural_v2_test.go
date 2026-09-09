package semantics

import (
	"testing"

	"marketsignallab/internal/domain"
)

func TestProjectStructuralV2CopiesLegacyValuesExactly(t *testing.T) {
	legacy := domain.MarketIndexSnapshot{
		CompositionIndex:    54.2,
		VolumeWeightedValue: 47.9,
		EqualSectorValue:    51.3,
		DivergenceValue:     -3.4,
	}
	got, err := ProjectStructural(ContractVersionV2, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if got.Contract.Version != ContractVersionV2 ||
		got.ObservedSegmentComposition != 54.2 ||
		got.CappedCompositionConcentration != 47.9 ||
		got.MeanEligibleSegmentComposition != 51.3 ||
		got.CompositionWeightingGap != -3.4 {
		t.Fatalf("projection=%+v", got)
	}
}

func TestProjectStructuralRejectsUnknownSemanticContract(t *testing.T) {
	if _, err := ProjectStructural("msl-semantic-contract/999", domain.MarketIndexSnapshot{}); err == nil {
		t.Fatal("expected unsupported semantic contract error")
	}
}
