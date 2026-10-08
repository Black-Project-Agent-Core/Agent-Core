package app

import (
	"reflect"
	"sort"
	"testing"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
	"marketsignallab/internal/storage"
)

func TestBuildEvidenceAssessmentsRejectsUnknownRun(t *testing.T) {
	st, svc := newEvidenceTestService(t)
	_ = st
	if _, err := svc.BuildEvidenceAssessments("missing-run"); err == nil {
		t.Fatal("unknown run was accepted")
	}
}

func TestBuildEvidenceAssessmentsRejectsIncompleteCurrentRun(t *testing.T) {
	st, svc := newEvidenceTestService(t)
	plan := evidencePlan("plan-current", "scope-a", "2026-08-26T00:00:00Z")
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run := evidenceRun("run-current", plan.ID, "scope-a", domain.MarketMapRunRunning, "2026-08-26T00:00:00Z")
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.BuildEvidenceAssessments(run.ID); err == nil {
		t.Fatal("non-completed run was accepted")
	}
}

func TestBuildEvidenceAssessmentsRejectsMissingCurrentPlan(t *testing.T) {
	st, svc := newEvidenceTestService(t)
	run := evidenceRun("run-current", "missing-plan", "scope-a", domain.MarketMapRunCompleted, "2026-08-26T00:00:00Z")
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.BuildEvidenceAssessments(run.ID); err == nil {
		t.Fatal("completed run with missing plan was accepted")
	}
}

func TestBuildEvidenceAssessmentsWithoutPriorComparableRunPersistsSuppressedMovementAndSmallPRRs(t *testing.T) {
	st, svc, current := seedEvidenceFixture(t, false)
	result, err := svc.BuildEvidenceAssessments(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Persisted || result.AssessmentCount != 5 || len(result.Assessments) != 5 {
		t.Fatalf("result=%+v", result)
	}

	breadth := mustEvidenceAssessmentBySignal(t, result.Assessments, "catalog.directional_breadth.v0.1")
	momentum := mustEvidenceAssessmentBySignal(t, result.Assessments, "catalog.competition_momentum.v0.1")
	for _, row := range []domain.SignalEvidenceAssessmentRecord{breadth, momentum} {
		if row.ValuePresent || row.Value != nil || row.Assessment.Eligibility != domain.SignalEligibilitySuppressed {
			t.Fatalf("movement row escaped suppression: %+v", row)
		}
	}

	productPRR := mustEvidenceAssessmentBySignal(t, result.Assessments, "product.peer_relative_rank.v0.1")
	if productPRR.ValuePresent || productPRR.Value != nil || productPRR.Assessment.Eligibility != domain.SignalEligibilitySuppressed || !recordHasReason(productPRR, domain.ReasonSmallPeerGroup) {
		t.Fatalf("product PRR=%+v", productPRR)
	}
	catalogPRR := mustEvidenceAssessmentBySignal(t, result.Assessments, "catalog.peer_relative_rank.v0.1")
	if catalogPRR.ValuePresent || catalogPRR.Value != nil || catalogPRR.Assessment.Eligibility != domain.SignalEligibilitySuppressed || !recordHasReason(catalogPRR, domain.ReasonSmallPeerGroup) {
		t.Fatalf("catalog PRR=%+v", catalogPRR)
	}

	persisted, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{RunID: current.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(persisted) != 5 {
		t.Fatalf("persisted=%d want 5", len(persisted))
	}
}

func TestBuildEvidenceAssessmentsWithCompatiblePriorRunQualifiesMovementWithoutLegacyConfidenceRelabeling(t *testing.T) {
	_, svc, current := seedEvidenceFixture(t, true)
	result, err := svc.BuildEvidenceAssessments(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, signalID := range []string{"catalog.directional_breadth.v0.1", "catalog.competition_momentum.v0.1"} {
		row := mustEvidenceAssessmentBySignal(t, result.Assessments, signalID)
		if !row.ValuePresent || row.Value == nil || row.Assessment.Eligibility != domain.SignalEligibilityEligible || row.Assessment.EvidenceStage != domain.EvidenceStageMovementIndication {
			t.Fatalf("qualified movement %s=%+v", signalID, row)
		}
		if row.Assessment.ObservationReliability != nil || row.Assessment.TemporalComparabilityRate != nil || row.Assessment.MovementParticipationRate != nil {
			t.Fatalf("legacy confidence/coverage was relabeled into evidence facts: %+v", row.Assessment)
		}
		if row.Assessment.Confidence.Score != nil || row.Assessment.Confidence.Band != domain.ConfidenceBandUncalibrated {
			t.Fatalf("confidence=%+v", row.Assessment.Confidence)
		}
	}
}

func TestBuildEvidenceAssessmentsSecondIdenticalBuildUsesSameIDsWithoutDuplicateLedgerRows(t *testing.T) {
	st, svc, current := seedEvidenceFixture(t, true)
	first, err := svc.BuildEvidenceAssessments(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.BuildEvidenceAssessments(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(sortedAssessmentIDs(first.Assessments), sortedAssessmentIDs(second.Assessments)) {
		t.Fatalf("ids changed\nfirst=%v\nsecond=%v", sortedAssessmentIDs(first.Assessments), sortedAssessmentIDs(second.Assessments))
	}
	persisted, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{RunID: current.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(persisted) != len(first.Assessments) {
		t.Fatalf("duplicate ledger rows persisted=%d first=%d", len(persisted), len(first.Assessments))
	}
}

func TestAssessmentIDIsDeterministicAndIdentitySensitive(t *testing.T) {
	base := []string{"run-1", "catalog", "catalog-1", "signal-a", "model-1", evidencepkg.RequirementsVersion}
	id := evidencepkg.AssessmentID(base[0], base[1], base[2], base[3], base[4], base[5])
	if id == "" || id[:4] != "eva_" {
		t.Fatalf("id=%q", id)
	}
	if again := evidencepkg.AssessmentID(base[0], base[1], base[2], base[3], base[4], base[5]); again != id {
		t.Fatalf("same tuple changed id: %q != %q", again, id)
	}
	for i := range base {
		changed := append([]string(nil), base...)
		changed[i] += "-changed"
		got := evidencepkg.AssessmentID(changed[0], changed[1], changed[2], changed[3], changed[4], changed[5])
		if got == id {
			t.Fatalf("field %d did not change assessment ID", i)
		}
	}
}

func TestEvidenceServiceReadHelpersExposeRequirementsAndPersistedAssessments(t *testing.T) {
	_, svc, current := seedEvidenceFixture(t, false)
	if got := svc.EvidenceRequirements(); len(got) != 5 {
		t.Fatalf("requirements=%d want 5", len(got))
	}
	if _, err := svc.BuildEvidenceAssessments(current.ID); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.EvidenceAssessments(domain.SignalEvidenceAssessmentFilter{RunID: current.ID, SignalID: "structural.observed_segment_composition.v0.1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows=%d", len(rows))
	}
	row, ok, err := svc.EvidenceAssessment(domain.SignalEvidenceAssessmentFilter{RunID: current.ID, EntityType: rows[0].EntityType, EntityID: rows[0].EntityID, SignalID: rows[0].SignalID})
	if err != nil || !ok || row.AssessmentID != rows[0].AssessmentID {
		t.Fatalf("row=%+v ok=%v err=%v", row, ok, err)
	}
}

func newEvidenceTestService(t *testing.T) (*storage.Store, *Service) {
	t.Helper()
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	t.Cleanup(func() { _ = svc.Close() })
	return st, svc
}

func seedEvidenceFixture(t *testing.T, includeCompatiblePrior bool) (*storage.Store, *Service, domain.MarketMapRun) {
	t.Helper()
	st, svc := newEvidenceTestService(t)
	currentPlan := evidencePlan("plan-current", "scope-a", "2026-08-26T00:00:00Z")
	if err := st.SaveMarketMapPlan(currentPlan); err != nil {
		t.Fatal(err)
	}
	current := evidenceRun("run-current", currentPlan.ID, "scope-a", domain.MarketMapRunCompleted, "2026-08-26T00:00:00Z")
	current.RankingAsOf = "2026-08-26T00:00:00Z"
	current.Coverage = 99.9
	current.Confidence = 98.8
	if err := st.AppendMarketMapRun(current); err != nil {
		t.Fatal(err)
	}

	node := domain.CatalogNode{ID: "catalog-1", Platform: "envato", ContentType: "graphics", Name: "Catalog 1", CanonicalKey: "envato|graphics|catalog-1", Level: domain.CatalogLevelCatalog}
	if err := st.SaveCatalogNode(node); err != nil {
		t.Fatal(err)
	}

	currentWindow := domain.RankingWindow{Days: 30, CurrentStart: "2026-07-27T00:00:00Z", CurrentEnd: current.RankingAsOf, PreviousStart: "2026-06-27T00:00:00Z", PreviousEnd: "2026-07-27T00:00:00Z"}
	catalog := domain.CatalogSnapshot{
		ID: "catalog-current", CatalogID: node.ID, Window: currentWindow, ObservedAt: current.RankingAsOf,
		ObservedProducts: 10, NewProducts: 3, PreviousNewProducts: 2, ComparableProducts: 4,
		ExposureBreadth: 61.25, CompetitionAcceleration: 17.5, RelativeStrength: 82.75,
		Coverage: 97.7, Confidence: 96.6,
		ModelVersion: "catalog-snapshot-v0.2", ProvenanceID: "prov-catalog-current", MarketMapRunID: current.ID,
	}
	if err := st.AppendCatalogSnapshot(catalog); err != nil {
		t.Fatal(err)
	}
	product := domain.ProductSnapshot{
		ID: "product-current", ProductID: "product-1", CatalogID: node.ID, Window: currentWindow, ObservedAt: current.RankingAsOf,
		RelativeStrength: 50, ComparableHistory: false,
		Coverage: 95.5, Confidence: 94.4,
		ModelVersion: "product-snapshot-v0.2", ProvenanceID: "prov-product-current", MarketMapRunID: current.ID,
	}
	if err := st.AppendProductSnapshot(product); err != nil {
		t.Fatal(err)
	}
	index := domain.MarketIndexSnapshot{
		ID: "index-current", RunID: current.ID, EntityID: "segment-1", CompositionIndex: 73.5,
		SampleSize: 10, Coverage: 93.3, Confidence: 92.2,
		GeneratedAt: current.CompletedAt, ProvenanceID: "prov-index-current", ModelVersion: "volume-weighted-market-index-v0.1",
	}
	if err := st.AppendMarketIndexSnapshot(index); err != nil {
		t.Fatal(err)
	}

	if includeCompatiblePrior {
		priorPlan := evidencePlan("plan-prior", "scope-a", "2026-07-27T00:00:00Z")
		if err := st.SaveMarketMapPlan(priorPlan); err != nil {
			t.Fatal(err)
		}
		prior := evidenceRun("run-prior", priorPlan.ID, "scope-a", domain.MarketMapRunCompleted, "2026-07-27T00:00:00Z")
		prior.RankingAsOf = "2026-07-27T00:00:00Z"
		if err := st.AppendMarketMapRun(prior); err != nil {
			t.Fatal(err)
		}
		priorWindow := domain.RankingWindow{Days: 30, CurrentStart: "2026-06-27T00:00:00Z", CurrentEnd: prior.RankingAsOf, PreviousStart: "2026-05-28T00:00:00Z", PreviousEnd: "2026-06-27T00:00:00Z"}
		priorCatalog := catalog
		priorCatalog.ID = "catalog-prior"
		priorCatalog.Window = priorWindow
		priorCatalog.ObservedAt = prior.RankingAsOf
		priorCatalog.MarketMapRunID = prior.ID
		priorCatalog.ProvenanceID = "prov-catalog-prior"
		priorCatalog.ObservedProducts = 8
		priorCatalog.NewProducts = 2
		priorCatalog.PreviousNewProducts = 1
		priorCatalog.ComparableProducts = 3
		if err := st.AppendCatalogSnapshot(priorCatalog); err != nil {
			t.Fatal(err)
		}
	}
	return st, svc, current
}

func evidencePlan(id, compatibilityKey, createdAt string) domain.MarketMapPlan {
	return domain.MarketMapPlan{
		ID: id, CreatedAt: createdAt, CompatibilityKey: compatibilityKey,
		PlannerVersion: "planner/1", SamplingSchemaVersion: "sampling/1", TaxonomyVersion: "taxonomy/1", IndexWeightingVersion: "weights/1",
	}
}

func evidenceRun(id, planID, compatibilityKey string, status domain.MarketMapRunStatus, completedAt string) domain.MarketMapRun {
	startedAt := completedAt
	if id == "run-current" {
		startedAt = "2026-08-25T23:00:00Z"
	} else if id == "run-prior" {
		startedAt = "2026-07-26T23:00:00Z"
	}
	return domain.MarketMapRun{
		ID: id, PlanID: planID, CompatibilityKey: compatibilityKey,
		SamplingSchemaVersion: "sampling/1", TaxonomyVersion: "taxonomy/1", IndexWeightingVersion: "weights/1",
		StartedAt: startedAt, CompletedAt: completedAt, Status: status,
	}
}

func mustEvidenceAssessmentBySignal(t *testing.T, rows []domain.SignalEvidenceAssessmentRecord, signalID string) domain.SignalEvidenceAssessmentRecord {
	t.Helper()
	for _, row := range rows {
		if row.SignalID == signalID {
			return row
		}
	}
	t.Fatalf("signal %s not found in %+v", signalID, rows)
	return domain.SignalEvidenceAssessmentRecord{}
}

func recordHasReason(row domain.SignalEvidenceAssessmentRecord, reason domain.ReasonCode) bool {
	for _, got := range row.Assessment.ReasonCodes {
		if got == reason {
			return true
		}
	}
	return false
}

func sortedAssessmentIDs(rows []domain.SignalEvidenceAssessmentRecord) []string {
	out := make([]string, len(rows))
	for i := range rows {
		out[i] = rows[i].AssessmentID
	}
	sort.Strings(out)
	return out
}
