package domain

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return time.Now().UTC().Format("20060102T150405.000000000")
	}
	return hex.EncodeToString(b)
}

type MarketIdentity struct {
	ID             string   `json:"id"`
	TargetPlatform string   `json:"targetPlatform"`
	Theme          string   `json:"theme"`
	ProductType    string   `json:"productType"`
	SubNiche       string   `json:"subNiche"`
	UseCase        string   `json:"useCase"`
	Audience       string   `json:"audience"`
	Style          string   `json:"style,omitempty"`
	Keywords       []string `json:"keywords,omitempty"`
	Watched        bool     `json:"watched"`
	CreatedAt      string   `json:"createdAt"`
}

func NewIdentity(theme, productType, subNiche, useCase, audience string) MarketIdentity {
	return MarketIdentity{ID: NewID(), TargetPlatform: "elements", Theme: theme, ProductType: productType, SubNiche: subNiche, UseCase: useCase, Audience: audience, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
}

type FeatureSet struct {
	DemandProxy    *float64 `json:"demandProxy,omitempty"`
	SupplyGap      *float64 `json:"supplyGap,omitempty"`
	MarketMomentum *float64 `json:"marketMomentum,omitempty"`
	CompetitiveGap *float64 `json:"competitiveGap,omitempty"`
	FreshnessGap   *float64 `json:"freshnessGap,omitempty"`
	ExternalTrend  *float64 `json:"externalTrend,omitempty"`
	Seasonality    *float64 `json:"seasonality,omitempty"`
}

type OpportunityResult struct {
	Score            float64            `json:"score"`
	ModelName        string             `json:"modelName"`
	ModelVersion     string             `json:"modelVersion"`
	ModelKind        string             `json:"modelKind"`
	CoverageWeight   float64            `json:"coverageWeight"`
	Missing          []string           `json:"missing"`
	Contributions    map[string]float64 `json:"contributions"`
	EffectiveWeights map[string]float64 `json:"effectiveWeights"`
}

type ConfidenceContext struct {
	EvidenceVolume           float64 `json:"evidenceVolume"`
	RelevantCoverage         float64 `json:"relevantCoverage"`
	IndependentSources       float64 `json:"independentSources"`
	HistoryDepth             float64 `json:"historyDepth"`
	FeatureCompleteness      float64 `json:"featureCompleteness"`
	CrossSourceConsistency   float64 `json:"crossSourceConsistency"`
	Recency                  float64 `json:"recency"`
	TargetPlatform           string  `json:"targetPlatform"`
	DirectElementsEvidence   bool    `json:"directElementsEvidence"`
	SourceClassCount         int     `json:"sourceClassCount"`
	HistorySnapshots         int     `json:"historySnapshots"`
	CriticalEvidenceAgeHours float64 `json:"criticalEvidenceAgeHours"`
}

type Analysis struct {
	ID             string         `json:"id"`
	IdentityID     string         `json:"identityId"`
	AsOf           string         `json:"asOf"`
	Opportunity    float64        `json:"opportunity"`
	Confidence     float64        `json:"confidence"`
	Direction      string         `json:"direction"`
	Features       FeatureSet     `json:"features"`
	ModelVersion   string         `json:"modelVersion"`
	CoverageWeight float64        `json:"coverageWeight"`
	Missing        []string       `json:"missing,omitempty"`
	Warning        string         `json:"warning,omitempty"`
	Explanation    map[string]any `json:"explanation,omitempty"`
}

type Benchmark struct {
	ID               string   `json:"id"`
	IdentityID       string   `json:"identityId"`
	AsOf             string   `json:"asOf"`
	SourceLabel      string   `json:"sourceLabel"`
	Demand           *float64 `json:"demand,omitempty"`
	Growth           *float64 `json:"growth,omitempty"`
	ResultsCount     *int     `json:"resultsCount,omitempty"`
	SearchToDownload *float64 `json:"searchToDownload,omitempty"`
	Supply           *float64 `json:"supply,omitempty"`
	Direction        string   `json:"direction,omitempty"`
	Notes            string   `json:"notes,omitempty"`
}

type Comparison struct {
	ID                 string   `json:"id"`
	IdentityID         string   `json:"identityId"`
	AsOf               string   `json:"asOf"`
	AnalysisID         string   `json:"analysisId"`
	BenchmarkID        string   `json:"benchmarkId"`
	Agreement          float64  `json:"agreement"`
	Divergence         float64  `json:"divergence"`
	DirectionAgreement string   `json:"directionAgreement"`
	BenchmarkComposite *float64 `json:"benchmarkComposite,omitempty"`
}

type ResearchMetric struct {
	ID          string  `json:"id"`
	IdentityID  string  `json:"identityId"`
	AsOf        string  `json:"asOf"`
	Source      string  `json:"source"`
	Metric      string  `json:"metric"`
	Value       float64 `json:"value"`
	Reliability string  `json:"reliability"`
	Method      string  `json:"method"`
	Notes       string  `json:"notes,omitempty"`
}

type EvidenceRecord struct {
	ID          string  `json:"id"`
	IdentityID  string  `json:"identityId"`
	ObservedAt  string  `json:"observedAt"`
	SourceType  string  `json:"sourceType"`
	SourceLabel string  `json:"sourceLabel"`
	Metric      string  `json:"metric"`
	Value       float64 `json:"value"`
	Unit        string  `json:"unit"`
	Query       string  `json:"query,omitempty"`
	SampleSize  int     `json:"sampleSize,omitempty"`
	Reliability string  `json:"reliability"`
	Method      string  `json:"method"`
	Notes       string  `json:"notes,omitempty"`
}
