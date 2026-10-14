package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"path/filepath"
	"reflect"
	"testing"

	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
	"marketsignallab/internal/semantics"
	"marketsignallab/internal/storage"
)

func TestEvidenceAPIRequirementsContractAndMethod(t *testing.T) {
	_, srv := evidenceAPIServer(t)
	var body struct {
		ContractVersion     string                             `json:"contractVersion"`
		RequirementsVersion string                             `json:"requirementsVersion"`
		Requirements        []domain.SignalEvidenceRequirement `json:"requirements"`
	}
	w := requestJSON(t, srv, http.MethodGet, "/api/evidence/requirements", nil, &body)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if body.ContractVersion != evidencepkg.ContractVersion || body.RequirementsVersion != evidencepkg.RequirementsVersion || len(body.Requirements) != 5 {
		t.Fatalf("body=%+v", body)
	}
	w = requestJSON(t, srv, http.MethodPost, "/api/evidence/requirements", map[string]string{}, nil)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("method status=%d", w.Code)
	}
}

func TestEvidenceAPIRejectsUnsupportedContractAndRequirementsVersions(t *testing.T) {
	_, srv := evidenceAPIServer(t)
	paths := []string{
		"/api/evidence/requirements?contractVersion=msl-evidence-contract%2F999",
		"/api/evidence/requirements?requirementsVersion=msl-evidence-requirements%2F999",
		"/api/evidence/assessments?contractVersion=msl-evidence-contract%2F999",
		"/api/evidence/assessments?requirementsVersion=msl-evidence-requirements%2F999",
		"/api/evidence/assessment?runId=run-1&entityType=catalog&entityId=catalog-1&signalId=signal-a&contractVersion=msl-evidence-contract%2F999",
	}
	for _, path := range paths {
		w := requestJSON(t, srv, http.MethodGet, path, nil, nil)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("path=%s status=%d body=%s", path, w.Code, w.Body.String())
		}
	}
}

func TestEvidenceAPIAssessmentFiltersAreDeterministicANDIncludingAssessmentID(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	rows := []domain.SignalEvidenceAssessmentRecord{
		webEvidenceRecord("eva-a", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z"),
		webEvidenceRecord("eva-b", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T02:00:00Z"),
		webEvidenceRecord("eva-c", "run-1", "catalog", "catalog-2", "signal-a", "model-1", "2026-08-26T03:00:00Z"),
		webEvidenceRecord("eva-d", "run-2", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T04:00:00Z"),
		webEvidenceRecord("eva-e", "run-1", "catalog", "catalog-1", "signal-b", "model-1", "2026-08-26T05:00:00Z"),
		webEvidenceRecord("eva-f", "run-1", "catalog", "catalog-1", "signal-a", "model-2", "2026-08-26T06:00:00Z"),
	}
	if err := st.AppendSignalEvidenceAssessments(rows); err != nil {
		t.Fatal(err)
	}

	query := url.Values{}
	query.Set("runId", "run-1")
	query.Set("entityType", "catalog")
	query.Set("entityId", "catalog-1")
	query.Set("signalId", "signal-a")
	query.Set("signalModelVersion", "model-1")
	query.Set("requirementsVersion", evidencepkg.RequirementsVersion)
	var body struct {
		ContractVersion string                                  `json:"contractVersion"`
		Assessments     []domain.SignalEvidenceAssessmentRecord `json:"assessments"`
	}
	w := requestJSON(t, srv, http.MethodGet, "/api/evidence/assessments?"+query.Encode(), nil, &body)
	if w.Code != http.StatusOK || body.ContractVersion != evidencepkg.ContractVersion {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if got := webAssessmentIDs(body.Assessments); !reflect.DeepEqual(got, []string{"eva-a", "eva-b"}) {
		t.Fatalf("ids=%v", got)
	}

	query.Set("assessmentId", "eva-b")
	w = requestJSON(t, srv, http.MethodGet, "/api/evidence/assessments?"+query.Encode(), nil, &body)
	if w.Code != http.StatusOK || len(body.Assessments) != 1 || body.Assessments[0].AssessmentID != "eva-b" {
		t.Fatalf("assessmentId filter status=%d body=%s", w.Code, w.Body.String())
	}

	query.Set("assessmentId", "eva-c")
	w = requestJSON(t, srv, http.MethodGet, "/api/evidence/assessments?"+query.Encode(), nil, &body)
	if w.Code != http.StatusOK || len(body.Assessments) != 0 {
		t.Fatalf("AND filter status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEvidenceAPIAssessmentsMethodRestrictions(t *testing.T) {
	_, srv := evidenceAPIServer(t)
	for _, method := range []string{http.MethodPut, http.MethodPatch, http.MethodDelete} {
		w := requestJSON(t, srv, method, "/api/evidence/assessments", nil, nil)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("method=%s status=%d", method, w.Code)
		}
	}
	w := requestJSON(t, srv, http.MethodPost, "/api/evidence/assessment", map[string]string{}, nil)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("singular post status=%d", w.Code)
	}
}

func TestEvidenceAPISingularReturnsLatestAnd404WhenAbsent(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	first := webEvidenceRecord("eva-a", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T01:00:00Z")
	latest := webEvidenceRecord("eva-b", "run-1", "catalog", "catalog-1", "signal-a", "model-1", "2026-08-26T02:00:00Z")
	if err := st.AppendSignalEvidenceAssessments([]domain.SignalEvidenceAssessmentRecord{latest, first}); err != nil {
		t.Fatal(err)
	}

	var body struct {
		ContractVersion string                                `json:"contractVersion"`
		Assessment      domain.SignalEvidenceAssessmentRecord `json:"assessment"`
	}
	path := "/api/evidence/assessment?runId=run-1&entityType=catalog&entityId=catalog-1&signalId=signal-a"
	w := requestJSON(t, srv, http.MethodGet, path, nil, &body)
	if w.Code != http.StatusOK || body.ContractVersion != evidencepkg.ContractVersion || body.Assessment.AssessmentID != "eva-b" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}

	w = requestJSON(t, srv, http.MethodGet, "/api/evidence/assessment?runId=run-1&entityType=catalog&entityId=catalog-1&signalId=missing", nil, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("missing status=%d body=%s", w.Code, w.Body.String())
	}
	w = requestJSON(t, srv, http.MethodGet, "/api/evidence/assessment?runId=run-1&entityType=catalog&entityId=catalog-1", nil, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("required query status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEvidenceAPIPostBuildRejectsInvalidOrIncompleteRunAs422(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	w := requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{"runId": "missing-run"}, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown run status=%d body=%s", w.Code, w.Body.String())
	}
	plan := domain.MarketMapPlan{ID: "plan-1", CompatibilityKey: "scope-a", CreatedAt: "2026-08-26T00:00:00Z"}
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run := domain.MarketMapRun{ID: "run-running", PlanID: plan.ID, CompatibilityKey: "scope-a", Status: domain.MarketMapRunRunning, StartedAt: "2026-08-26T00:00:00Z"}
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	w = requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{"runId": run.ID}, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("incomplete run status=%d body=%s", w.Code, w.Body.String())
	}
	w = requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{}, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty run status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEvidenceAPIPostBuildReturnsVersionedWrapper(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	plan := domain.MarketMapPlan{ID: "plan-1", CompatibilityKey: "scope-a", CreatedAt: "2026-08-26T00:00:00Z"}
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run := domain.MarketMapRun{ID: "run-complete", PlanID: plan.ID, CompatibilityKey: "scope-a", Status: domain.MarketMapRunCompleted, StartedAt: "2026-08-25T23:00:00Z", CompletedAt: "2026-08-26T00:00:00Z"}
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	var body struct {
		ContractVersion string                     `json:"contractVersion"`
		Result          domain.EvidenceBuildResult `json:"result"`
	}
	w := requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{"runId": run.ID}, &body)
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if body.ContractVersion != evidencepkg.ContractVersion || body.Result.RunID != run.ID || !body.Result.Persisted || body.Result.AssessmentCount != 0 {
		t.Fatalf("body=%+v", body)
	}
}

func TestC3EvidenceDoesNotAlterC2Semantics(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	node := domain.CatalogNode{ID: "catalog-1", Platform: "Envato Elements", ContentType: "Presentation", Name: "Catalog 1", CanonicalKey: "elements/presentation/catalog-1", Level: domain.CatalogLevelCatalog}
	if err := st.SaveCatalogNode(node); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendCatalogSnapshot(domain.CatalogSnapshot{
		ID: "catalog-snapshot-1", CatalogID: node.ID,
		Window:          domain.RankingWindow{Days: 30, CurrentStart: "2026-07-27T00:00:00Z", CurrentEnd: "2026-08-26T00:00:00Z"},
		ExposureBreadth: 61.25, CompetitionAcceleration: 17.5, RelativeStrength: 82.75, OpportunityScore: 73.5,
		NewSupplyVelocityPercent: 12.5, NewSupplyVelocityIndex: 63.25,
		ModelVersion: "catalog-snapshot-v0.2", ObservedAt: "2026-08-26T00:00:00Z",
	}); err != nil {
		t.Fatal(err)
	}

	var rows []map[string]any
	w := requestJSON(t, srv, http.MethodGet, "/api/ranking/catalogs?windowDays=30&asOf=2026-08-26T00:00:00Z", nil, &rows)
	if w.Code != http.StatusOK || len(rows) != 1 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	semanticsObj, ok := rows[0]["semantics"].(map[string]any)
	if !ok {
		t.Fatalf("semantics=%T %+v", rows[0]["semantics"], rows[0]["semantics"])
	}
	contract, ok := semanticsObj["contract"].(map[string]any)
	if !ok || contract["version"] != semantics.ContractVersionV2 {
		t.Fatalf("contract=%+v semantics=%+v", contract, semanticsObj)
	}
	for _, forbidden := range []string{"evidenceStage", "eligibility", "signalEligibility", "confidence", "reasonCodes", "reasons"} {
		if _, exists := semanticsObj[forbidden]; exists {
			t.Fatalf("C3 field %q leaked into C2 semantics: %+v", forbidden, semanticsObj)
		}
	}
	if semanticsObj["directionalBreadth"] != 61.25 || semanticsObj["competitionMomentumPercent"] != 17.5 || semanticsObj["peerRelativeRank"] != 82.75 || semanticsObj["catalogInsightScore"] != 73.5 {
		t.Fatalf("C2 semantic aliases changed: %+v", semanticsObj)
	}

	encoded, err := json.Marshal(semanticsObj)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) == 0 {
		t.Fatal("empty semantics JSON")
	}
}

func evidenceAPIServer(t *testing.T) (*storage.Store, *Server) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.New(st)
	t.Cleanup(func() { _ = svc.Close() })
	return st, New(svc)
}

func webEvidenceRecord(assessmentID, runID, entityType, entityID, signalID, modelVersion, assessedAt string) domain.SignalEvidenceAssessmentRecord {
	value := 10.0
	return domain.SignalEvidenceAssessmentRecord{
		AssessmentID: assessmentID, RunID: runID, EntityType: entityType, EntityID: entityID,
		SignalID: signalID, SignalModelVersion: modelVersion, RequirementsVersion: evidencepkg.RequirementsVersion,
		ValuePresent: true, Value: &value,
		Assessment: domain.EvidenceAssessment{
			AssessmentID: assessmentID, RequirementsVersion: evidencepkg.RequirementsVersion,
			SignalID: signalID, SignalModelVersion: modelVersion, EntityType: entityType, EntityID: entityID, RunID: runID,
			EvidenceStage: domain.EvidenceStageCompositionOnly, Eligibility: domain.SignalEligibilityEligible,
			Confidence: evidencepkg.UncalibratedConfidence(), ProvenanceID: "prov-" + assessmentID, AssessedAt: assessedAt,
		},
		ProvenanceID: "prov-" + assessmentID, AssessedAt: assessedAt,
	}
}

func webAssessmentIDs(rows []domain.SignalEvidenceAssessmentRecord) []string {
	out := make([]string, len(rows))
	for i := range rows {
		out[i] = rows[i].AssessmentID
	}
	return out
}
