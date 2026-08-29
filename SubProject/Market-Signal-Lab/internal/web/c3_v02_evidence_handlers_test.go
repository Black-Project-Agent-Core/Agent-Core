package web

import (
	"net/http"
	"testing"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
)

func TestC31EvidenceRequirementsExplicitVersionIsAdditive(t *testing.T) {
	_, srv := evidenceAPIServer(t)
	var v1 evidenceRequirementsResponse
	w := requestJSON(t, srv, http.MethodGet, "/api/evidence/requirements", nil, &v1)
	if w.Code != http.StatusOK || v1.RequirementsVersion != evidencepkg.RequirementsVersion || len(v1.Requirements) != 5 {
		t.Fatalf("v1 status=%d body=%+v", w.Code, v1)
	}
	var v2 evidenceRequirementsResponse
	w = requestJSON(t, srv, http.MethodGet, "/api/evidence/requirements?requirementsVersion=msl-evidence-requirements%2F2", nil, &v2)
	if w.Code != http.StatusOK || v2.RequirementsVersion != evidencepkg.RequirementsVersionC31 || len(v2.Requirements) != 9 {
		t.Fatalf("v2 status=%d body=%+v raw=%s", w.Code, v2, w.Body.String())
	}
}

func TestC31EvidenceBuildPOSTDispatchesByRequirementsVersion(t *testing.T) {
	st, srv := evidenceAPIServer(t)
	plan := domain.MarketMapPlan{ID: "plan-c31-api", CompatibilityKey: "scope", CreatedAt: "2026-08-26T00:00:00Z", PlannerVersion: "planner/1", SamplingSchemaVersion: "sampling/1", TaxonomyVersion: "taxonomy/1", IndexWeightingVersion: "weights/1"}
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run := domain.MarketMapRun{ID: "run-c31-api", PlanID: plan.ID, CompatibilityKey: "scope", Status: domain.MarketMapRunCompleted, StartedAt: "2026-08-25T23:00:00Z", CompletedAt: "2026-08-26T00:00:00Z", SamplingSchemaVersion: "sampling/1", TaxonomyVersion: "taxonomy/1", IndexWeightingVersion: "weights/1"}
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	var body evidenceBuildResponse
	w := requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{"runId": run.ID, "requirementsVersion": evidencepkg.RequirementsVersionC31}, &body)
	if w.Code != http.StatusCreated || body.ContractVersion != evidencepkg.ContractVersion || body.Result.RunID != run.ID || !body.Result.Persisted {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestC31EvidenceBuildRejectsUnsupportedBodyVersion(t *testing.T) {
	_, srv := evidenceAPIServer(t)
	w := requestJSON(t, srv, http.MethodPost, "/api/evidence/assessments", map[string]string{"runId": "run", "requirementsVersion": "msl-evidence-requirements/999"}, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
