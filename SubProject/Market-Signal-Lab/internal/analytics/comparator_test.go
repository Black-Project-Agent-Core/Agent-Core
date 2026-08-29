package analytics

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestComparatorKeepsIndependentScoreUnchanged(t *testing.T) {
	our := domain.Analysis{Opportunity: 61.7, Direction: "rising"}
	env := domain.Benchmark{Demand: floatPtr(80), Growth: floatPtr(75), Supply: floatPtr(40), Direction: "rising"}
	cmp := Compare(our, env)
	if our.Opportunity != 61.7 {
		t.Fatalf("independent score was mutated: %v", our.Opportunity)
	}
	if cmp.Agreement < 0 || cmp.Agreement > 100 || cmp.Divergence < 0 || cmp.Divergence > 100 {
		t.Fatalf("invalid comparison: %+v", cmp)
	}
	if cmp.DirectionAgreement != "same" {
		t.Fatalf("direction=%q", cmp.DirectionAgreement)
	}
}

func floatPtr(v float64) *float64 { return &v }
