package storage

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
)

func TestSignalEvidenceAssessmentRoundTripPreservesEligibleAndSuppressedRows(t *testing.T) {
	root := t.TempDir()
	st, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}

	eligibleValue := 61.25
	eligible := signalEvidenceRecord(
		"eva-eligible", "run-1", "catalog", "catalog-1",
		"catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2",
		"2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, &eligibleValue,
	)
	suppressed := signalEvidenceRecord(
		"eva-suppressed", "run-1", "product", "product-1",
		"product.peer_relative_rank.v0.1", "product-snapshot-v0.2",
		"2026-08-26T02:00:00Z", domain.SignalEligibilitySuppressed, nil,
	)
	suppressed.Assessment.ReasonCodes = []domain.ReasonCode{domain.ReasonSmallPeerGroup}

	if err := st.AppendSignalEvidenceAssessment(eligible); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendSignalEvidenceAssessments([]domain.SignalEvidenceAssessmentRecord{suppressed}); err != nil {
		t.Fatal(err)
	}

	got, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{RunID: "run-1"})
	if err != nil {
		t.Fatal(err)
	}
	want := []domain.SignalEvidenceAssessmentRecord{eligible, suppressed}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip mismatch\ngot=%+v\nwant=%+v", got, want)
	}
	if got[1].ValuePresent || got[1].Value != nil {
		t.Fatalf("suppressed value state=%+v", got[1])
	}
	if got[1].Assessment.Confidence.Score != nil ||
		got[1].Assessment.Confidence.Band != domain.ConfidenceBandUncalibrated ||
		got[1].Assessment.Confidence.ModelVersion != evidencepkg.ConfidenceModelVersion {
		t.Fatalf("suppressed confidence=%+v", got[1].Assessment.Confidence)
	}
	if got[1].RequirementsVersion != evidencepkg.RequirementsVersion || got[1].Assessment.RequirementsVersion != evidencepkg.RequirementsVersion {
		t.Fatalf("requirements versions record=%q assessment=%q", got[1].RequirementsVersion, got[1].Assessment.RequirementsVersion)
	}
}

func TestSignalEvidenceAssessmentFiltersCombineWithANDAndSortDeterministically(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	rows := []domain.SignalEvidenceAssessmentRecord{
		signalEvidenceRecord("eva-c", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T02:00:00Z", domain.SignalEligibilityEligible, evidenceValue(3)),
		signalEvidenceRecord("eva-b", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, evidenceValue(2)),
		signalEvidenceRecord("eva-a", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, evidenceValue(1)),
		signalEvidenceRecord("eva-other-run", "run-2", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T00:00:00Z", domain.SignalEligibilityEligible, evidenceValue(4)),
		signalEvidenceRecord("eva-other-entity", "run-1", "catalog", "catalog-2", "signal-a", "model-1", "2026-08-26T00:00:00Z", domain.SignalEligibilityEligible, evidenceValue(5)),
		signalEvidenceRecord("eva-other-signal", "run-1", "catalog", "catalog-1", "signal-b", "model-1", "2026-08-26T00:00:00Z", domain.SignalEligibilityEligible, evidenceValue(6)),
		signalEvidenceRecord("eva-other-model", "run-1", "catalog", "catalog-1", "signal-a", "model-2", "2026-08-26T00:00:00Z", domain.SignalEligibilityEligible, evidenceValue(7)),
	}
	rows[6].RequirementsVersion = "other-requirements/1"
	rows[6].Assessment.RequirementsVersion = "other-requirements/1"
	if err := st.AppendSignalEvidenceAssessments(rows); err != nil {
		t.Fatal(err)
	}

	filter := domain.SignalEvidenceAssessmentFilter{
		RunID:               "run-1",
		EntityType:          "catalog",
		EntityID:            "catalog-1",
		SignalID:            "signal-a",
		SignalModelVersion:  "model-1",
		RequirementsVersion: evidencepkg.RequirementsVersion,
	}
	got, err := st.SignalEvidenceAssessments(filter)
	if err != nil {
		t.Fatal(err)
	}
	gotIDs := assessmentIDs(got)
	wantIDs := []string{"eva-a", "eva-b", "eva-c"}
	if !reflect.DeepEqual(gotIDs, wantIDs) {
		t.Fatalf("ids=%v want=%v", gotIDs, wantIDs)
	}

	filter.Limit = 2
	limited, err := st.SignalEvidenceAssessments(filter)
	if err != nil {
		t.Fatal(err)
	}
	if got := assessmentIDs(limited); !reflect.DeepEqual(got, []string{"eva-a", "eva-b"}) {
		t.Fatalf("limited ids=%v", got)
	}

	latest, ok, err := st.LatestSignalEvidenceAssessment(filter)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || latest.AssessmentID != "eva-c" {
		t.Fatalf("latest=%+v ok=%v", latest, ok)
	}
}

func TestSignalEvidenceAssessmentAppendIsIdempotentByAssessmentIDAcrossBatchAndReopen(t *testing.T) {
	root := t.TempDir()
	st, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	first := signalEvidenceRecord("eva-stable", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, evidenceValue(10))
	changed := first
	changed.Value = evidenceValue(99)
	changed.Assessment.Eligibility = domain.SignalEligibilityDegraded

	if err := st.AppendSignalEvidenceAssessments([]domain.SignalEvidenceAssessmentRecord{first, changed, first}); err != nil {
		t.Fatal(err)
	}
	rows, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Value == nil || *rows[0].Value != 10 || rows[0].Assessment.Eligibility != domain.SignalEligibilityEligible {
		t.Fatalf("same-batch idempotence rows=%+v", rows)
	}

	reopened, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := reopened.AppendSignalEvidenceAssessment(changed); err != nil {
		t.Fatal(err)
	}
	rows, err = reopened.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Value == nil || *rows[0].Value != 10 {
		t.Fatalf("reopen idempotence rows=%+v", rows)
	}
}

func TestSignalEvidenceAssessmentRejectsMissingAssessmentID(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	row := signalEvidenceRecord("", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, evidenceValue(1))
	if err := st.AppendSignalEvidenceAssessment(row); err == nil {
		t.Fatal("missing assessment ID was accepted")
	}
}

func TestC3EvidenceDoesNotRewriteLegacyHistoryLedgers(t *testing.T) {
	root := t.TempDir()
	st, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}

	if err := st.AppendProductSnapshot(domain.ProductSnapshot{ID: "product-row", ProductID: "product-1", CatalogID: "catalog-1", ModelVersion: "product-snapshot-v0.2"}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendCatalogSnapshot(domain.CatalogSnapshot{ID: "catalog-row", CatalogID: "catalog-1", ModelVersion: "catalog-snapshot-v0.2"}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendMarketIndexSnapshot(domain.MarketIndexSnapshot{ID: "index-row", RunID: "run-1", EntityID: "segment-1", ModelVersion: "volume-weighted-market-index-v0.1"}); err != nil {
		t.Fatal(err)
	}

	legacyFiles := []string{"product_snapshots.jsonl", "catalog_snapshots.jsonl", "market_index_snapshots.jsonl"}
	before := map[string][]byte{}
	for _, name := range legacyFiles {
		before[name] = mustReadStorageFile(t, filepath.Join(root, "history", name))
	}

	record := signalEvidenceRecord("eva-1", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilitySuppressed, nil)
	record.Assessment.ReasonCodes = []domain.ReasonCode{domain.ReasonMissingRequiredComponent}
	if err := st.AppendSignalEvidenceAssessment(record); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SignalEvidenceAssessments(domain.SignalEvidenceAssessmentFilter{}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := st.LatestSignalEvidenceAssessment(domain.SignalEvidenceAssessmentFilter{RunID: "run-1"}); err != nil {
		t.Fatal(err)
	}

	for _, name := range legacyFiles {
		after := mustReadStorageFile(t, filepath.Join(root, "history", name))
		if !bytes.Equal(before[name], after) {
			t.Fatalf("C3 evidence operation rewrote legacy %s", name)
		}
	}
}

func TestSignalEvidenceAssessmentUsesCanonicalSeparateLedger(t *testing.T) {
	root := t.TempDir()
	st, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	row := signalEvidenceRecord("eva-ledger", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z", domain.SignalEligibilityEligible, evidenceValue(1))
	if err := st.AppendSignalEvidenceAssessment(row); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "history", "signal_evidence_assessments.jsonl")
	if info, err := os.Stat(path); err != nil || info.Size() == 0 {
		t.Fatalf("canonical evidence ledger missing/empty: info=%v err=%v", info, err)
	}
}

func signalEvidenceRecord(
	assessmentID, runID, entityType, entityID, signalID, modelVersion, assessedAt string,
	eligibility domain.SignalEligibility,
	value *float64,
) domain.SignalEvidenceAssessmentRecord {
	valuePresent := value != nil
	stage := domain.EvidenceStageCompositionOnly
	if eligibility != domain.SignalEligibilitySuppressed && signalID == "catalog.directional_breadth.v0.1" {
		stage = domain.EvidenceStageMovementIndication
	}
	return domain.SignalEvidenceAssessmentRecord{
		AssessmentID:        assessmentID,
		RunID:               runID,
		EntityType:          entityType,
		EntityID:            entityID,
		SignalID:            signalID,
		SignalModelVersion:  modelVersion,
		RequirementsVersion: evidencepkg.RequirementsVersion,
		ValuePresent:        valuePresent,
		Value:               cloneEvidenceTestFloat(value),
		Assessment: domain.EvidenceAssessment{
			AssessmentID:        assessmentID,
			RequirementsVersion: evidencepkg.RequirementsVersion,
			SignalID:            signalID,
			SignalModelVersion:  modelVersion,
			EntityType:          entityType,
			EntityID:            entityID,
			RunID:               runID,
			EvidenceStage:       stage,
			Eligibility:         eligibility,
			Confidence: domain.ConfidenceAssessment{
				Band:         domain.ConfidenceBandUncalibrated,
				ModelVersion: evidencepkg.ConfidenceModelVersion,
			},
			ProvenanceID: "provenance-" + assessmentID,
			AssessedAt:   assessedAt,
		},
		ProvenanceID: "provenance-" + assessmentID,
		AssessedAt:   assessedAt,
	}
}

func evidenceValue(v float64) *float64 { return &v }

func cloneEvidenceTestFloat(v *float64) *float64 {
	if v == nil {
		return nil
	}
	out := *v
	return &out
}

func assessmentIDs(rows []domain.SignalEvidenceAssessmentRecord) []string {
	out := make([]string, len(rows))
	for i := range rows {
		out[i] = rows[i].AssessmentID
	}
	return out
}

func mustReadStorageFile(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
