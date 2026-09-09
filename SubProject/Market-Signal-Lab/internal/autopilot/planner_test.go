package autopilot

import (
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"reflect"
	"testing"
)

func plannerInput(mode domain.MarketMapMode) PlanInput {
	categories := map[string][]envatoconn.CategoryNode{}
	for _, site := range SupportedSites() {
		categories[site] = []envatoconn.CategoryNode{{Name: "Templates", Path: "templates", Children: []envatoconn.CategoryNode{{Name: "Presentations", Path: "presentation-templates"}, {Name: "Mockups", Path: "mockups"}, {Name: "Graphics", Path: "graphics"}, {Name: "Print", Path: "print"}}}}
	}
	return PlanInput{Mode: mode, Categories: categories, CreatedAt: "2026-08-16T01:00:00Z"}
}

func TestBuildPlanIsDeterministicBoundedAndCoversSites(t *testing.T) {
	a, err := BuildPlan(plannerInput(domain.MarketMapModeStandard))
	if err != nil {
		t.Fatal(err)
	}
	b, err := BuildPlan(plannerInput(domain.MarketMapModeStandard))
	if err != nil {
		t.Fatal(err)
	}
	if a.CompatibilityKey != b.CompatibilityKey || !reflect.DeepEqual(a.Targets, b.Targets) {
		t.Fatal("plan not deterministic")
	}
	if a.RequestBudget != 48 || len(a.Targets) > 48 {
		t.Fatalf("budget=%d targets=%d", a.RequestBudget, len(a.Targets))
	}
	seen := map[string]bool{}
	for _, target := range a.Targets {
		seen[target.Site] = true
	}
	for _, site := range SupportedSites() {
		if !seen[site] {
			t.Fatalf("missing site %s", site)
		}
	}
}

func TestBuildPlanModeDepthIncreases(t *testing.T) {
	quick, _ := BuildPlan(plannerInput(domain.MarketMapModeQuick))
	standard, _ := BuildPlan(plannerInput(domain.MarketMapModeStandard))
	deep, _ := BuildPlan(plannerInput(domain.MarketMapModeDeep))
	if quick.RequestBudget != 28 || standard.RequestBudget != 48 || deep.RequestBudget != 60 {
		t.Fatalf("budgets %d %d %d", quick.RequestBudget, standard.RequestBudget, deep.RequestBudget)
	}
	if !(len(quick.Targets) < len(standard.Targets) && len(standard.Targets) < len(deep.Targets)) {
		t.Fatalf("targets %d %d %d", len(quick.Targets), len(standard.Targets), len(deep.Targets))
	}
}

func TestBuildPlanRejectsUnsupportedMode(t *testing.T) {
	if _, err := BuildPlan(PlanInput{Mode: "unlimited"}); err == nil {
		t.Fatal("expected error")
	}
}

func TestBuildPlanDoesNotLetAnEmptySiteReduceLaterCategoryDepth(t *testing.T) {
	in := plannerInput(domain.MarketMapModeDeep)
	in.Categories[SupportedSites()[0]] = nil
	laterSite := SupportedSites()[1]
	plan, err := BuildPlan(in)
	if err != nil {
		t.Fatal(err)
	}
	newCategoryCount := 0
	for _, target := range plan.Targets {
		if target.Site == laterSite && target.Surface == domain.MarketSurfaceNew && target.Category != "" {
			newCategoryCount++
		}
	}
	if newCategoryCount != 3 {
		t.Fatalf("later site new targets=%d; want 3", newCategoryCount)
	}
}

func TestBuildPlanSubtractsBootstrapRequestsFromTargetBudget(t *testing.T) {
	plan, err := BuildPlan(PlanInput{Mode: domain.MarketMapModeStandard, BootstrapRequestsUsed: 14, CreatedAt: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	used := 0
	for _, target := range plan.Targets {
		used += target.RequestAllowance
	}
	if used > 34 {
		t.Fatalf("target allowances=%d must fit remaining budget 34", used)
	}
	if plan.RequestBudget != 48 {
		t.Fatalf("full run budget=%d", plan.RequestBudget)
	}
}

func TestBuildPlanCompatibilityIncludesIntegrityVersions(t *testing.T) {
	plan, err := BuildPlan(PlanInput{Mode: domain.MarketMapModeStandard, CreatedAt: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.PlannerVersion != "market-map-planner-v0.2" || plan.SamplingSchemaVersion != "sampling-schema-v0.1" || plan.TaxonomyVersion != "taxonomy-segmentation-v0.1" || plan.IndexWeightingVersion != "index-weighting-v0.1" {
		t.Fatalf("plan=%+v", plan)
	}
}
