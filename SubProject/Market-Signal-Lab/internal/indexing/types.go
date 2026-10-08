package indexing

import "marketsignallab/internal/domain"

const (
	VolumeIndexModelVersion = "volume-weighted-market-index-v0.1"
	EqualIndexModelVersion  = "equal-sector-market-index-v0.1"
	DivergenceModelVersion  = "index-divergence-v0.1"
)

type SegmentEvidence struct {
	Level                     domain.SegmentLevel
	EntityID, ParentID, Label string
	Volume, Composition       float64
	Coverage, Confidence      float64
	Quality                   domain.DataQualityAssessment
	Eligible                  bool
}

type BuildInput struct {
	RunID, PriorRunID, GeneratedAt string
	Segments                       []SegmentEvidence
}

type WeightResult struct {
	Weights                     map[string]float64
	ConfiguredCap, EffectiveCap float64
	FallbackRules               []string
}

type BuildResult struct {
	Global        domain.MarketIndexSnapshot
	Hierarchy     []domain.MarketIndexSnapshot
	WeightResults map[string]WeightResult
}

type WeightedChild struct {
	Value    float64
	Eligible bool
}
