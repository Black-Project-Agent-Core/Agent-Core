package consensus

import (
	"context"
	"marketsignallab/internal/domain"
	"testing"
)

func ptrInt(v int) *int { return &v }

func TestStableRanksProduceLowVolatility(t *testing.T) {
	got, err := BuildItemVolatilityWithEngine(context.Background(), testAnalyticsEngine, ItemVolatilityInput{Ranks: []*int{ptrInt(5), ptrInt(7), ptrInt(4), ptrInt(6)}, TopK: 30, ConsecutiveAppearances: 4, EligibleSnapshots: 4, RBOToPrevious: 82})
	if err != nil {
		t.Fatal(err)
	}
	if got.Score >= 25 || got.Label != string(domain.StabilityStable) {
		t.Fatalf("got=%+v", got)
	}
}

func TestIntermittentTopRanksProduceExtremeVolatility(t *testing.T) {
	got, err := BuildItemVolatilityWithEngine(context.Background(), testAnalyticsEngine, ItemVolatilityInput{Ranks: []*int{ptrInt(2), nil, ptrInt(28), ptrInt(3), nil}, TopK: 30, ConsecutiveAppearances: 1, EligibleSnapshots: 5, RBOToPrevious: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got.Score < 65 || got.Label != string(domain.StabilityExtreme) {
		t.Fatalf("got=%+v", got)
	}
}
