package sampling

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestConfigForModeLocksStandardSchema(t *testing.T) {
	got, err := ConfigForMode(domain.MarketMapModeStandard)
	if err != nil {
		t.Fatal(err)
	}
	if got.RequestBudget != 48 || got.CategoryDepth != 1 || got.CategoryBootstrapPerSiteMax != 2 || got.TargetSample != 20 {
		t.Fatalf("got=%+v", got)
	}
}

func TestRoundRobinTargetsPreventsSiteStarvationAndHonorsBudget(t *testing.T) {
	candidates := map[string][]domain.MarketMapSurfaceTarget{
		"3docean.net":      {{ID: "a1", RequestAllowance: 2}, {ID: "a2", RequestAllowance: 1}, {ID: "a3", RequestAllowance: 1}},
		"graphicriver.net": {{ID: "g1", RequestAllowance: 2}, {ID: "g2", RequestAllowance: 1}, {ID: "g3", RequestAllowance: 1}},
		"videohive.net":    {{ID: "v1", RequestAllowance: 2}, {ID: "v2", RequestAllowance: 1}, {ID: "v3", RequestAllowance: 1}},
	}
	rows := RoundRobinTargets(candidates, 9)
	seen := map[string]int{}
	used := 0
	for _, row := range rows {
		seen[row.Site]++
		used += row.RequestAllowance
	}
	if len(seen) != 3 || seen["3docean.net"] != 2 || seen["graphicriver.net"] != 2 || seen["videohive.net"] != 2 {
		t.Fatalf("seen=%+v", seen)
	}
	if used > 9 {
		t.Fatalf("used=%d", used)
	}
}
