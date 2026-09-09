package consensus

import (
	"context"
	"math"
	"testing"
)

func TestOverlapCoefficient(t *testing.T) {
	if got := OverlapCoefficient([]string{"a", "b", "c"}, []string{"b", "c", "d", "e"}); math.Abs(got-66.6666667) > .001 {
		t.Fatalf("got %v", got)
	}
	if got := OverlapCoefficient(nil, []string{"a"}); got != 0 {
		t.Fatalf("got %v", got)
	}
}

func TestRankBiasedOverlapRewardsTopAgreement(t *testing.T) {
	identical := RankBiasedOverlap([]string{"a", "b", "c"}, []string{"a", "b", "c"}, .90)
	topMismatch := RankBiasedOverlap([]string{"a", "b", "c"}, []string{"x", "b", "c"}, .90)
	deepMismatch := RankBiasedOverlap([]string{"a", "b", "c"}, []string{"a", "b", "x"}, .90)
	if identical < 99.9 || !(deepMismatch > topMismatch) {
		t.Fatalf("identical=%v top=%v deep=%v", identical, topMismatch, deepMismatch)
	}
}

func TestSharedRankAgreementIgnoresCensoredMissingItems(t *testing.T) {
	got, shared := SharedRankAgreement([]string{"a", "b", "c", "d"}, []string{"x", "a", "b", "y"})
	if shared != 2 || got <= 0 || got > 100 {
		t.Fatalf("got=%v shared=%d", got, shared)
	}
}

func TestJensenShannonSimilarity(t *testing.T) {
	got, err := JensenShannonSimilarityWithEngine(context.Background(), testAnalyticsEngine, map[string]float64{"mockup": 1}, map[string]float64{"mockup": 1})
	if err != nil {
		t.Fatal(err)
	}
	if got < 99.9 {
		t.Fatalf("got %v", got)
	}
	got, err = JensenShannonSimilarityWithEngine(context.Background(), testAnalyticsEngine, map[string]float64{"mockup": 1}, map[string]float64{"poster": 1})
	if err != nil {
		t.Fatal(err)
	}
	if got > .001 {
		t.Fatalf("got %v", got)
	}
}
