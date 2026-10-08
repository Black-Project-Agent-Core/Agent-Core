package analyticsengine

import "context"

const ProtocolV1 = "msl-analytics/1"

type Capability string

const (
	CapabilityDistributionSimilarity Capability = "distribution_similarity"
	CapabilityItemVolatility         Capability = "item_volatility"
	CapabilityClusterVolatility      Capability = "cluster_volatility"
	CapabilitySelectionProbability   Capability = "selection_probability"
)

func PilotCapabilities() []Capability {
	return []Capability{
		CapabilityDistributionSimilarity,
		CapabilityItemVolatility,
		CapabilityClusterVolatility,
		CapabilitySelectionProbability,
	}
}

type EngineStatus string

const (
	EngineStarting         EngineStatus = "starting"
	EngineHealthy          EngineStatus = "healthy"
	EngineDegraded         EngineStatus = "degraded"
	EngineUnavailable      EngineStatus = "unavailable"
	EngineProtocolMismatch EngineStatus = "protocol_mismatch"
	EngineCrashed          EngineStatus = "crashed"
	EngineTimedOut         EngineStatus = "timed_out"
	EngineInvalidResult    EngineStatus = "invalid_result"
)

type Health struct {
	Status   EngineStatus `json:"status"`
	Engine   string       `json:"engine"`
	Version  string       `json:"version,omitempty"`
	Protocol string       `json:"protocol,omitempty"`
	Message  string       `json:"message,omitempty"`
}

type DistributionSimilarityInput struct {
	A map[string]float64 `json:"a"`
	B map[string]float64 `json:"b"`
}

type DistributionSimilarityResult struct {
	Score float64 `json:"score"`
}

type ItemVolatilityInput struct {
	Ranks                  []*int  `json:"ranks"`
	TopK                   int     `json:"topK"`
	ConsecutiveAppearances int     `json:"consecutiveAppearances"`
	EligibleSnapshots      int     `json:"eligibleSnapshots"`
	RBOToPrevious          float64 `json:"rboToPrevious"`
}

type ClusterVolatilityInput struct {
	Shares               []float64 `json:"shares"`
	ContextDisagreement  float64   `json:"contextDisagreement"`
	CrossTimePersistence float64   `json:"crossTimePersistence"`
}

type VolatilityResult struct {
	Score                   float64 `json:"score"`
	Label                   string  `json:"label"`
	RankVariance            float64 `json:"rankVariance,omitempty"`
	AbsenceRate             float64 `json:"absenceRate,omitempty"`
	MedianAbsoluteDeviation float64 `json:"medianAbsoluteDeviation,omitempty"`
	RBOPersistence          float64 `json:"rboPersistence,omitempty"`
	ConsecutivePersistence  float64 `json:"consecutivePersistence,omitempty"`
}

type SelectionObservation struct {
	Weight   float64 `json:"weight"`
	Selected bool    `json:"selected"`
}

type SelectionProbabilityInput struct {
	Observations []SelectionObservation `json:"observations"`
}

type SelectionProbabilityResult struct {
	Score          float64 `json:"score"`
	SelectedCount  int     `json:"selectedCount"`
	EligibleCount  int     `json:"eligibleCount"`
	SelectedWeight float64 `json:"selectedWeight"`
	EligibleWeight float64 `json:"eligibleWeight"`
}

type Engine interface {
	Name() string
	Version() string
	Capabilities() []Capability
	Health(context.Context) Health
	DistributionSimilarity(context.Context, DistributionSimilarityInput) (DistributionSimilarityResult, error)
	ItemVolatility(context.Context, ItemVolatilityInput) (VolatilityResult, error)
	ClusterVolatility(context.Context, ClusterVolatilityInput) (VolatilityResult, error)
	SelectionProbability(context.Context, SelectionProbabilityInput) (SelectionProbabilityResult, error)
	Close() error
}
