package evidence

import "marketsignallab/internal/domain"

type AssessmentContext struct {
	AssessmentID string
	EntityType   string
	EntityID     string
	RunID        string
	ProvenanceID string
	AssessedAt   string
}

type EvidenceFacts struct {
	ComparableWindowCount     *int
	ObservedProducts          *int
	ComparableProducts        *int
	TemporalComparabilityRate *float64
	MovementParticipationRate *float64
	QueriesPlanned            *int
	QueriesObserved           *int
	QueriesComparable         *int
	QueryObservationRate      *float64
	QueryComparabilityRate    *float64
	EligibleSurfaces          *int
	CompletedSurfaces         *int
	SurfaceCompletionRate     *float64
	AttributedProducts        *int
	AttributionPresent        *bool
	AttributionCoverage       *float64
	ObservationReliability    *float64
	PeerDefinitionVersion     *string
	PeerGroupSize             *int
	ComparablePeerShare       *float64
	PeerSpread                *float64
	TieDensity                *float64
	EligibleChildCount        *int
	TotalChildCount           *int
	EligibleChildShare        *float64
	ScopeComparability        *domain.ScopeComparabilityResult
	StableMeasureDefinition   *bool
	UnderlyingStage           *domain.EvidenceStage
	ValuePresent              *bool
	SampleSize                *int
	FactualReasonCodes        []domain.ReasonCode
}
