package domain

type EvidenceStage string

const (
	EvidenceStageCompositionOnly      EvidenceStage = "COMPOSITION_ONLY"
	EvidenceStageMovementIndication   EvidenceStage = "MOVEMENT_INDICATION"
	EvidenceStagePreliminaryTrend     EvidenceStage = "PRELIMINARY_TREND"
	EvidenceStageEstablishedTrend     EvidenceStage = "ESTABLISHED_TREND"
	EvidenceStageSeasonalityCandidate EvidenceStage = "SEASONALITY_CANDIDATE"
)

type SignalEligibility string

const (
	SignalEligibilityEligible   SignalEligibility = "ELIGIBLE"
	SignalEligibilityDegraded   SignalEligibility = "DEGRADED"
	SignalEligibilitySuppressed SignalEligibility = "SUPPRESSED"
)

type ClaimType string

const (
	ClaimTypeComposition  ClaimType = "composition"
	ClaimTypeMovement     ClaimType = "movement"
	ClaimTypePeerRelative ClaimType = "peer_relative"
)

type RuleClass string

const (
	RuleClassDeterministic           RuleClass = "DETERMINISTIC_PRODUCTION_RULE"
	RuleClassConfigurableThreshold   RuleClass = "CONFIGURABLE_THRESHOLD"
	RuleClassFutureCalibrationTarget RuleClass = "FUTURE_CALIBRATION_TARGET"
)

type RequirementApplicability string

const (
	RequirementRequired      RequirementApplicability = "REQUIRED"
	RequirementRecommended   RequirementApplicability = "RECOMMENDED"
	RequirementNotApplicable RequirementApplicability = "NOT_APPLICABLE"
)

type FailureDisposition string

const (
	FailureDispositionInfo     FailureDisposition = "INFO"
	FailureDispositionDegrade  FailureDisposition = "DEGRADE"
	FailureDispositionSuppress FailureDisposition = "SUPPRESS"
)

type ScopeComparabilityStatus string

const (
	ScopeComparabilityNotApplicable      ScopeComparabilityStatus = "NOT_APPLICABLE"
	ScopeComparabilityExactMatch         ScopeComparabilityStatus = "EXACT_MATCH"
	ScopeComparabilityDeclaredCompatible ScopeComparabilityStatus = "DECLARED_COMPATIBLE"
	ScopeComparabilityIncompatible       ScopeComparabilityStatus = "INCOMPATIBLE"
)

type ThresholdState string

const (
	ThresholdConcrete       ThresholdState = "CONCRETE"
	ThresholdToBeCalibrated ThresholdState = "TO_BE_CALIBRATED"
)

type ConfidenceBand string

const ConfidenceBandUncalibrated ConfidenceBand = "UNCALIBRATED"

type ReasonCode string

type RequirementThreshold struct {
	State ThresholdState `json:"state"`
	Value *float64       `json:"value,omitempty"`
}

type RequirementRule struct {
	Dimension          string                   `json:"dimension"`
	Applicability      RequirementApplicability `json:"applicability"`
	RuleClass          RuleClass                `json:"ruleClass"`
	Threshold          *RequirementThreshold    `json:"threshold,omitempty"`
	FailureDisposition FailureDisposition       `json:"failureDisposition"`
	ReasonCode         ReasonCode               `json:"reasonCode"`
}

type SignalEvidenceRequirement struct {
	SignalID               string            `json:"signalId"`
	SignalModelVersion     string            `json:"signalModelVersion"`
	ClaimType              ClaimType         `json:"claimType"`
	RequirementsVersion    string            `json:"requirementsVersion"`
	StagePolicyVersion     string            `json:"stagePolicyVersion"`
	ConfidenceModelVersion string            `json:"confidenceModelVersion"`
	Rules                  []RequirementRule `json:"rules"`
}

type ScopeComparabilityResult struct {
	Status                    ScopeComparabilityStatus `json:"status"`
	CurrentRunID              string                   `json:"currentRunId,omitempty"`
	PriorRunID                string                   `json:"priorRunId,omitempty"`
	PlannerComparable         *bool                    `json:"plannerComparable,omitempty"`
	SamplingSchemaComparable  *bool                    `json:"samplingSchemaComparable,omitempty"`
	TaxonomyComparable        *bool                    `json:"taxonomyComparable,omitempty"`
	WeightingComparable       *bool                    `json:"weightingComparable,omitempty"`
	SourcePolicyComparable    *bool                    `json:"sourcePolicyComparable,omitempty"`
	WindowDurationComparable  *bool                    `json:"windowDurationComparable,omitempty"`
	QueryUniverseComparable   *bool                    `json:"queryUniverseComparable,omitempty"`
	SurfaceUniverseComparable *bool                    `json:"surfaceUniverseComparable,omitempty"`
	ReasonCodes               []ReasonCode             `json:"reasonCodes,omitempty"`
}

type ConfidenceAssessment struct {
	Score        *float64       `json:"score"`
	Band         ConfidenceBand `json:"band"`
	ModelVersion string         `json:"modelVersion"`
	ReasonCodes  []ReasonCode   `json:"reasonCodes,omitempty"`
}

type EvidenceAssessment struct {
	AssessmentID              string                    `json:"assessmentId"`
	RequirementsVersion       string                    `json:"requirementsVersion"`
	SignalID                  string                    `json:"signalId"`
	SignalModelVersion        string                    `json:"signalModelVersion"`
	EntityType                string                    `json:"entityType"`
	EntityID                  string                    `json:"entityId"`
	RunID                     string                    `json:"runId"`
	EvidenceStage             EvidenceStage             `json:"evidenceStage"`
	Eligibility               SignalEligibility         `json:"eligibility"`
	ReasonCodes               []ReasonCode              `json:"reasonCodes,omitempty"`
	ComparableWindowCount     *int                      `json:"comparableWindowCount,omitempty"`
	ObservedProducts          *int                      `json:"observedProducts,omitempty"`
	ComparableProducts        *int                      `json:"comparableProducts,omitempty"`
	TemporalComparabilityRate *float64                  `json:"temporalComparabilityRate,omitempty"`
	MovementParticipationRate *float64                  `json:"movementParticipationRate,omitempty"`
	QueriesPlanned            *int                      `json:"queriesPlanned,omitempty"`
	QueriesObserved           *int                      `json:"queriesObserved,omitempty"`
	QueriesComparable         *int                      `json:"queriesComparable,omitempty"`
	QueryObservationRate      *float64                  `json:"queryObservationRate,omitempty"`
	QueryComparabilityRate    *float64                  `json:"queryComparabilityRate,omitempty"`
	EligibleSurfaces          *int                      `json:"eligibleSurfaces,omitempty"`
	CompletedSurfaces         *int                      `json:"completedSurfaces,omitempty"`
	SurfaceCompletionRate     *float64                  `json:"surfaceCompletionRate,omitempty"`
	AttributedProducts        *int                      `json:"attributedProducts,omitempty"`
	AttributionCoverage       *float64                  `json:"attributionCoverage,omitempty"`
	ObservationReliability    *float64                  `json:"observationReliability,omitempty"`
	PeerGroupSize             *int                      `json:"peerGroupSize,omitempty"`
	ComparablePeerShare       *float64                  `json:"comparablePeerShare,omitempty"`
	PeerSpread                *float64                  `json:"peerSpread,omitempty"`
	TieDensity                *float64                  `json:"tieDensity,omitempty"`
	EligibleChildCount        *int                      `json:"eligibleChildCount,omitempty"`
	TotalChildCount           *int                      `json:"totalChildCount,omitempty"`
	EligibleChildShare        *float64                  `json:"eligibleChildShare,omitempty"`
	ScopeComparability        *ScopeComparabilityResult `json:"scopeComparability,omitempty"`
	Confidence                ConfidenceAssessment      `json:"confidence"`
	ProvenanceID              string                    `json:"provenanceId"`
	AssessedAt                string                    `json:"assessedAt"`
}

type SignalResult struct {
	SignalID           string             `json:"signalId"`
	SignalModelVersion string             `json:"signalModelVersion"`
	Value              *float64           `json:"value"`
	Evidence           EvidenceAssessment `json:"evidence"`
}

type SignalEvidenceAssessmentRecord struct {
	AssessmentID        string             `json:"assessmentId"`
	RunID               string             `json:"runId"`
	EntityType          string             `json:"entityType"`
	EntityID            string             `json:"entityId"`
	SignalID            string             `json:"signalId"`
	SignalModelVersion  string             `json:"signalModelVersion"`
	RequirementsVersion string             `json:"requirementsVersion"`
	ValuePresent        bool               `json:"valuePresent"`
	Value               *float64           `json:"value,omitempty"`
	Assessment          EvidenceAssessment `json:"assessment"`
	ProvenanceID        string             `json:"provenanceId"`
	AssessedAt          string             `json:"assessedAt"`
}
type SignalEvidenceAssessmentFilter struct {
	RunID               string
	EntityType          string
	EntityID            string
	SignalID            string
	SignalModelVersion  string
	RequirementsVersion string
	Limit               int
}

type EvidenceBuildResult struct {
	RunID           string                           `json:"runId"`
	AssessmentCount int                              `json:"assessmentCount"`
	Persisted       bool                             `json:"persisted"`
	Assessments     []SignalEvidenceAssessmentRecord `json:"assessments"`
}

const (
	ReasonLimitedTemporalDepth            ReasonCode = "LIMITED_TEMPORAL_DEPTH"
	ReasonNoComparableWindow              ReasonCode = "NO_COMPARABLE_WINDOW"
	ReasonWindowDurationMismatch          ReasonCode = "WINDOW_DURATION_MISMATCH"
	ReasonUnstableScanScope               ReasonCode = "UNSTABLE_SCAN_SCOPE"
	ReasonSamplingPolicyChanged           ReasonCode = "SAMPLING_POLICY_CHANGED"
	ReasonSourcePolicyChanged             ReasonCode = "SOURCE_POLICY_CHANGED"
	ReasonIncompatibleModelVersion        ReasonCode = "INCOMPATIBLE_MODEL_VERSION"
	ReasonInsufficientObservedProducts    ReasonCode = "INSUFFICIENT_OBSERVED_PRODUCTS"
	ReasonLowTemporalComparability        ReasonCode = "LOW_TEMPORAL_COMPARABILITY"
	ReasonLowParticipation                ReasonCode = "LOW_PARTICIPATION"
	ReasonLowObservationReliability       ReasonCode = "LOW_OBSERVATION_RELIABILITY"
	ReasonLowQueryObservation             ReasonCode = "LOW_QUERY_OBSERVATION"
	ReasonLowQueryComparability           ReasonCode = "LOW_QUERY_COMPARABILITY"
	ReasonIncompleteSurfaceCoverage       ReasonCode = "INCOMPLETE_SURFACE_COVERAGE"
	ReasonLowAttributionCoverage          ReasonCode = "LOW_ATTRIBUTION_COVERAGE"
	ReasonNoAttributedProducts            ReasonCode = "NO_ATTRIBUTED_PRODUCTS"
	ReasonSmallPeerGroup                  ReasonCode = "SMALL_PEER_GROUP"
	ReasonLowPeerComparability            ReasonCode = "LOW_PEER_COMPARABILITY"
	ReasonLowPeerSpread                   ReasonCode = "LOW_PEER_SPREAD"
	ReasonHighTieDensity                  ReasonCode = "HIGH_TIE_DENSITY"
	ReasonInsufficientMovementEligibility ReasonCode = "INSUFFICIENT_MOVEMENT_ELIGIBILITY"
	ReasonCapRelaxedForSmallPeerSet       ReasonCode = "CAP_RELAXED_FOR_SMALL_PEER_SET"
	ReasonZeroBaselineDelta               ReasonCode = "ZERO_BASELINE_DELTA"
	ReasonMissingRequiredComponent        ReasonCode = "MISSING_REQUIRED_COMPONENT"
)
