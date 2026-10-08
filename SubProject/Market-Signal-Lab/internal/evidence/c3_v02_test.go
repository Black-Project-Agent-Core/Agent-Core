package evidence

import (
	"math"
	"testing"
)

func TestC31CandidateWrapsRustOwnedValueWithoutRecomputation(t *testing.T) {
	facts := EvidenceFacts{ComparableWindowCount: intp(3)}
	got, err := NewDeterministicSignalV02Candidate(DeterministicSignalV02Source{
		SignalID: "catalog.competition_acceleration.v0.2", SignalModelVersion: CompetitionAccelerationModelV02,
		RunID: "run-3", EntityType: "catalog", EntityID: "catalog-a", ProvenanceID: "prov-a", Value: c31floatp(-17.3),
	}, AssessmentContext{RunID: "run-3", EntityType: "catalog", EntityID: "catalog-a"}, facts)
	if err != nil {
		t.Fatal(err)
	}
	if got.Value == nil || *got.Value != -17.3 {
		t.Fatalf("value=%v", got.Value)
	}
	if got.Requirement.RequirementsVersion != RequirementsVersionC31 || got.Requirement.SignalModelVersion != CompetitionAccelerationModelV02 {
		t.Fatalf("requirement=%+v", got.Requirement)
	}
	if got.Context.ProvenanceID != "prov-a" || got.ProvenanceID != "prov-a" {
		t.Fatalf("provenance=%+v", got)
	}
}

func TestC31CandidatePinsODMIPeerDefinition(t *testing.T) {
	got, err := NewDeterministicSignalV02Candidate(DeterministicSignalV02Source{
		SignalID: "catalog.peer_relative_rank_odmi.v0.2", SignalModelVersion: PeerRelativeRankModelV02,
		RunID: "r", EntityType: "catalog", EntityID: "c", Value: c31floatp(50),
	}, AssessmentContext{}, EvidenceFacts{})
	if err != nil {
		t.Fatal(err)
	}
	if got.Facts.PeerDefinitionVersion == nil || *got.Facts.PeerDefinitionVersion != CatalogODMIPeerDefinitionVersion {
		t.Fatalf("facts=%+v", got.Facts)
	}
	if got.PeerUniverse.DefinitionVersion != CatalogODMIPeerDefinitionVersion {
		t.Fatalf("peer=%+v", got.PeerUniverse)
	}
}

func TestC31CandidateFailsClosedOnIdentityAndNonFiniteValues(t *testing.T) {
	base := DeterministicSignalV02Source{SignalID: "catalog.odmi.v0.2", SignalModelVersion: DirectionalMomentumModelV02, RunID: "r", EntityType: "catalog", EntityID: "c", Value: c31floatp(10)}
	for _, tc := range []DeterministicSignalV02Source{
		{SignalID: base.SignalID, SignalModelVersion: base.SignalModelVersion, EntityType: base.EntityType, EntityID: base.EntityID, Value: base.Value},
		{SignalID: base.SignalID, SignalModelVersion: base.SignalModelVersion, RunID: base.RunID, EntityType: base.EntityType, Value: base.Value},
		{SignalID: base.SignalID, SignalModelVersion: base.SignalModelVersion, RunID: base.RunID, EntityType: base.EntityType, EntityID: base.EntityID, Value: c31floatp(math.NaN())},
	} {
		if _, err := NewDeterministicSignalV02Candidate(tc, AssessmentContext{}, EvidenceFacts{}); err == nil {
			t.Fatalf("expected failure: %+v", tc)
		}
	}
	if _, err := NewDeterministicSignalV02Candidate(base, AssessmentContext{EntityType: "product"}, EvidenceFacts{}); err == nil {
		t.Fatal("entity mismatch must fail")
	}
}

func c31floatp(value float64) *float64 { return &value }
