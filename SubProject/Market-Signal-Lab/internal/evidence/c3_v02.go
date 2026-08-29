package evidence

import (
	"fmt"
	"math"
	"strings"
)

type DeterministicSignalV02Source struct {
	SignalID           string
	SignalModelVersion string
	RunID              string
	EntityType         string
	EntityID           string
	ProvenanceID       string
	Value              *float64
}

func NewDeterministicSignalV02Candidate(source DeterministicSignalV02Source, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	if strings.TrimSpace(source.SignalID) == "" || strings.TrimSpace(source.SignalModelVersion) == "" {
		return EvidenceCandidate{}, fmt.Errorf("C3.1 deterministic signal identity is required")
	}
	if strings.TrimSpace(source.EntityType) == "" || strings.TrimSpace(source.EntityID) == "" {
		return EvidenceCandidate{}, fmt.Errorf("C3.1 deterministic entity identity is required")
	}
	if strings.TrimSpace(source.RunID) == "" {
		return EvidenceCandidate{}, fmt.Errorf("C3.1 deterministic source run is required")
	}
	if source.Value != nil && (math.IsNaN(*source.Value) || math.IsInf(*source.Value, 0)) {
		return EvidenceCandidate{}, fmt.Errorf("C3.1 deterministic source value must be finite")
	}
	req, err := RequirementForVersion(RequirementsVersionC31, source.SignalID, source.SignalModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if ctx.EntityType != "" && ctx.EntityType != source.EntityType {
		return EvidenceCandidate{}, fmt.Errorf("assessment entity type %q does not match C3.1 source %q", ctx.EntityType, source.EntityType)
	}
	if ctx.EntityID != "" && ctx.EntityID != source.EntityID {
		return EvidenceCandidate{}, fmt.Errorf("assessment entity id %q does not match C3.1 source %q", ctx.EntityID, source.EntityID)
	}
	if ctx.RunID != "" && ctx.RunID != source.RunID {
		return EvidenceCandidate{}, fmt.Errorf("assessment run %q does not match C3.1 source %q", ctx.RunID, source.RunID)
	}
	ctx.RunID = source.RunID
	ctx.EntityType = source.EntityType
	ctx.EntityID = source.EntityID
	if source.ProvenanceID != "" {
		ctx.ProvenanceID = source.ProvenanceID
	}
	valuePresent := source.Value != nil
	if facts.ValuePresent == nil {
		facts.ValuePresent = &valuePresent
	} else if *facts.ValuePresent != valuePresent {
		return EvidenceCandidate{}, fmt.Errorf("valuePresent fact does not match C3.1 source value presence")
	}
	candidate := EvidenceCandidate{
		Requirement:  req,
		Context:      ctx,
		Facts:        facts,
		Value:        cloneFloat64(source.Value),
		EntityType:   source.EntityType,
		EntityID:     source.EntityID,
		ProvenanceID: ctx.ProvenanceID,
	}
	if source.SignalID == "catalog.peer_relative_rank_odmi.v0.2" {
		if err := ensureStringFact(&candidate.Facts.PeerDefinitionVersion, CatalogODMIPeerDefinitionVersion, "peerDefinitionVersion"); err != nil {
			return EvidenceCandidate{}, err
		}
		candidate.PeerUniverse.DefinitionVersion = CatalogODMIPeerDefinitionVersion
	}
	return candidate, nil
}
