package app

import (
	"testing"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
	"marketsignallab/internal/storage"
)

func TestBuildEvidenceAssessmentsC31ThreeWindowsRunsRustAndBuildsPeerAndMovementEnvelope(t *testing.T) {
	st, svc, current := seedC31EvidenceFixture(t, 3, 2)
	result, err := svc.BuildEvidenceAssessmentsC31(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Persisted || result.AssessmentCount != 14 || len(result.Assessments) != 14 {
		t.Fatalf("result count=%d persisted=%v", result.AssessmentCount, result.Persisted)
	}

	assertC31CatalogValue(t, result.Assessments, "catalog-a", "catalog.competition_acceleration.v0.2", 15, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-a", "catalog.odmi.v0.2", 60, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-a", "catalog.momentum_magnitude.v0.2", 60, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-a", "catalog.peer_relative_rank_odmi.v0.2", 100, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-a", "catalog.author_concentration_change.v0.2", -3.8, domain.SignalEligibilityEligible)

	assertC31CatalogValue(t, result.Assessments, "catalog-b", "catalog.competition_acceleration.v0.2", -5, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-b", "catalog.odmi.v0.2", -60, domain.SignalEligibilityEligible)
	assertC31CatalogValue(t, result.Assessments, "catalog-b", "catalog.peer_relative_rank_odmi.v0.2", 0, domain.SignalEligibilityEligible)

	assertC31EntityValue(t, result.Assessments, "content_type", "parent", "structural.product_mass_weighted_movement.v0.2", 24, domain.SignalEligibilityEligible)
	assertC31EntityValue(t, result.Assessments, "content_type", "parent", "structural.equal_segment_movement.v0.2", 0, domain.SignalEligibilityEligible)
	assertC31EntityValue(t, result.Assessments, "content_type", "parent", "structural.signed_movement_divergence.v0.2", 24, domain.SignalEligibilityEligible)
	assertC31EntityValue(t, result.Assessments, "content_type", "parent", "structural.divergence_magnitude.v0.2", 24, domain.SignalEligibilityEligible)

	for _, row := range result.Assessments {
		if row.RequirementsVersion != evidencepkg.RequirementsVersionC31 {
			t.Fatalf("version=%s row=%+v", row.RequirementsVersion, row)
		}
		if row.Assessment.Confidence.Score != nil || row.Assessment.Confidence.Band != domain.ConfidenceBandUncalibrated {
			t.Fatalf("confidence=%+v", row.Assessment.Confidence)
		}
		if row.Assessment.EvidenceStage != domain.EvidenceStageMovementIndication {
			t.Fatalf("stage=%s row=%s", row.Assessment.EvidenceStage, row.SignalID)
		}
	}

	second, err := svc.BuildEvidenceAssessmentsC31(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Assessments) != len(result.Assessments) {
		t.Fatalf("second=%d first=%d", len(second.Assessments), len(result.Assessments))
	}
	persisted, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{RunID: current.ID, RequirementsVersion: evidencepkg.RequirementsVersionC31})
	if err != nil {
		t.Fatal(err)
	}
	if len(persisted) != len(result.Assessments) {
		t.Fatalf("persisted duplicates=%d want=%d", len(persisted), len(result.Assessments))
	}
}

func TestBuildEvidenceAssessmentsC31TwoWindowsSuppressesAccelerationButKeepsODMI(t *testing.T) {
	_, svc, current := seedC31EvidenceFixture(t, 2, 2)
	result, err := svc.BuildEvidenceAssessmentsC31(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	accel := mustC31Assessment(t, result.Assessments, "catalog", "catalog-a", "catalog.competition_acceleration.v0.2")
	if accel.ValuePresent || accel.Value != nil || accel.Assessment.Eligibility != domain.SignalEligibilitySuppressed || !recordHasReason(accel, domain.ReasonNoComparableWindow) {
		t.Fatalf("acceleration=%+v", accel)
	}
	odmi := mustC31Assessment(t, result.Assessments, "catalog", "catalog-a", "catalog.odmi.v0.2")
	if !odmi.ValuePresent || odmi.Value == nil || *odmi.Value != 60 || odmi.Assessment.Eligibility != domain.SignalEligibilityEligible || odmi.Assessment.EvidenceStage != domain.EvidenceStageMovementIndication {
		t.Fatalf("odmi=%+v", odmi)
	}
}

func TestBuildEvidenceAssessmentsC31OnePeerSuppressesPRRAndDivergenceWithoutNeutralPlaceholder(t *testing.T) {
	_, svc, current := seedC31EvidenceFixture(t, 3, 1)
	result, err := svc.BuildEvidenceAssessmentsC31(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	prr := mustC31Assessment(t, result.Assessments, "catalog", "catalog-a", "catalog.peer_relative_rank_odmi.v0.2")
	if prr.ValuePresent || prr.Value != nil || prr.Assessment.Eligibility != domain.SignalEligibilitySuppressed || !recordHasReason(prr, domain.ReasonSmallPeerGroup) {
		t.Fatalf("prr=%+v", prr)
	}
	signed := mustC31Assessment(t, result.Assessments, "content_type", "parent", "structural.signed_movement_divergence.v0.2")
	if signed.ValuePresent || signed.Value != nil || signed.Assessment.Eligibility != domain.SignalEligibilitySuppressed || !recordHasReason(signed, domain.ReasonInsufficientMovementEligibility) {
		t.Fatalf("signed=%+v", signed)
	}
	weighted := mustC31Assessment(t, result.Assessments, "content_type", "parent", "structural.product_mass_weighted_movement.v0.2")
	if !weighted.ValuePresent || weighted.Value == nil || *weighted.Value != 60 || weighted.Assessment.Eligibility != domain.SignalEligibilityEligible {
		t.Fatalf("weighted=%+v", weighted)
	}
}

func seedC31EvidenceFixture(t *testing.T, windowCount, peerCount int) (*storage.Store, *Service, domain.MarketMapRun) {
	t.Helper()
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	runtime := rankingParityRuntime(t)
	svc := newServiceBase(st, nil, runtime)
	t.Cleanup(func() { _ = svc.Close() })

	parent := domain.CatalogNode{ID: "parent", Platform: "envato", ContentType: "graphics", Name: "Graphics", CanonicalKey: "envato|graphics", Level: domain.CatalogLevelContentType}
	if err := st.SaveCatalogNode(parent); err != nil {
		t.Fatal(err)
	}
	children := []domain.CatalogNode{{ID: "catalog-a", ParentID: parent.ID, Platform: "envato", ContentType: "graphics", Name: "A", CanonicalKey: "envato|graphics|a", Level: domain.CatalogLevelCatalog}}
	if peerCount > 1 {
		children = append(children, domain.CatalogNode{ID: "catalog-b", ParentID: parent.ID, Platform: "envato", ContentType: "graphics", Name: "B", CanonicalKey: "envato|graphics|b", Level: domain.CatalogLevelCatalog})
	}
	for _, node := range children {
		if err := st.SaveCatalogNode(node); err != nil {
			t.Fatal(err)
		}
	}

	runs := []struct{ id, plan, completed, asof string }{
		{"run-old", "plan-old", "2026-06-27T00:00:00Z", "2026-06-27T00:00:00Z"},
		{"run-prior", "plan-prior", "2026-07-27T00:00:00Z", "2026-07-27T00:00:00Z"},
		{"run-current", "plan-current", "2026-08-26T00:00:00Z", "2026-08-26T00:00:00Z"},
	}
	start := 3 - windowCount
	for i := start; i < len(runs); i++ {
		r := runs[i]
		plan := evidencePlan(r.plan, "scope-c31", r.completed)
		if err := st.SaveMarketMapPlan(plan); err != nil {
			t.Fatal(err)
		}
		run := evidenceRun(r.id, plan.ID, "scope-c31", domain.MarketMapRunCompleted, r.completed)
		run.RankingAsOf = r.asof
		if err := st.AppendMarketMapRun(run); err != nil {
			t.Fatal(err)
		}
	}

	countsA := map[string]int{"run-old": 80, "run-prior": 100, "run-current": 140}
	countsB := map[string]int{"run-old": 40, "run-prior": 50, "run-current": 60}
	concA := map[string]float64{"run-old": 35, "run-prior": 31.25, "run-current": 27.5}
	concB := map[string]float64{"run-old": 50, "run-prior": 45, "run-current": 40}
	for i := start; i < len(runs); i++ {
		r := runs[i]
		window := domain.RankingWindow{Days: 30, CurrentEnd: r.asof}
		for _, node := range children {
			row := domain.CatalogSnapshot{ID: "snap-" + r.id + "-" + node.ID, CatalogID: node.ID, Window: window, ObservedAt: r.asof, ModelVersion: c3CatalogSnapshotModel, MarketMapRunID: r.id, ProvenanceID: "prov-" + r.id + "-" + node.ID, AuthorAttributionCoverage: 90}
			if node.ID == "catalog-a" {
				row.ObservedProducts = countsA[r.id]
				row.AuthorConcentration = concA[r.id]
				row.RisingProducts = 7
				row.NeutralProducts = 2
				row.FallingProducts = 1
				row.ComparableProducts = 10
			} else {
				row.ObservedProducts = countsB[r.id]
				row.AuthorConcentration = concB[r.id]
				row.RisingProducts = 1
				row.NeutralProducts = 2
				row.FallingProducts = 7
				row.ComparableProducts = 10
			}
			if err := st.AppendCatalogSnapshot(row); err != nil {
				t.Fatal(err)
			}
		}
	}
	current, ok, err := st.MarketMapRunByID("run-current")
	if err != nil || !ok {
		t.Fatalf("current ok=%v err=%v", ok, err)
	}
	return st, svc, current
}

func mustC31Assessment(t *testing.T, rows []domain.SignalEvidenceAssessmentRecord, entityType, entityID, signalID string) domain.SignalEvidenceAssessmentRecord {
	t.Helper()
	for _, row := range rows {
		if row.EntityType == entityType && row.EntityID == entityID && row.SignalID == signalID {
			return row
		}
	}
	t.Fatalf("missing %s/%s/%s", entityType, entityID, signalID)
	return domain.SignalEvidenceAssessmentRecord{}
}
func assertC31CatalogValue(t *testing.T, rows []domain.SignalEvidenceAssessmentRecord, id, signal string, want float64, eligibility domain.SignalEligibility) {
	t.Helper()
	assertC31EntityValue(t, rows, "catalog", id, signal, want, eligibility)
}
func assertC31EntityValue(t *testing.T, rows []domain.SignalEvidenceAssessmentRecord, entityType, id, signal string, want float64, eligibility domain.SignalEligibility) {
	t.Helper()
	row := mustC31Assessment(t, rows, entityType, id, signal)
	if row.Assessment.Eligibility != eligibility || row.Value == nil || *row.Value != want {
		t.Fatalf("%s/%s=%+v want=%v/%s", id, signal, row, want, eligibility)
	}
}
