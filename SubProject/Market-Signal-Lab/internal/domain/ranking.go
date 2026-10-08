package domain

type MarketDirection string

const (
	DirectionStrongRising  MarketDirection = "strong_rising"
	DirectionRising        MarketDirection = "rising"
	DirectionNeutral       MarketDirection = "neutral"
	DirectionFalling       MarketDirection = "falling"
	DirectionStrongFalling MarketDirection = "strong_falling"
)

type RankingWindow struct {
	Days          int    `json:"days"`
	CurrentStart  string `json:"currentStart"`
	CurrentEnd    string `json:"currentEnd"`
	PreviousStart string `json:"previousStart"`
	PreviousEnd   string `json:"previousEnd"`
}

type ModelDefinition struct {
	Name          string             `json:"name"`
	Version       string             `json:"version"`
	Kind          string             `json:"kind"`
	Weights       map[string]float64 `json:"weights"`
	MissingPolicy string             `json:"missingPolicy"`
	Notes         string             `json:"notes"`
}

type ProductSnapshot struct {
	ID                       string            `json:"id"`
	ProductID                string            `json:"productId"`
	CatalogID                string            `json:"catalogId"`
	Window                   RankingWindow     `json:"window"`
	ObservedAt               string            `json:"observedAt"`
	CurrentObservationCount  int               `json:"currentObservationCount"`
	PreviousObservationCount int               `json:"previousObservationCount"`
	QueryAppearances         int               `json:"queryAppearances"`
	ApplicableQueries        int               `json:"applicableQueries"`
	SurfaceAppearances       int               `json:"surfaceAppearances"`
	MedianPosition           float64           `json:"medianPosition"`
	PreviousMedianPosition   *float64          `json:"previousMedianPosition,omitempty"`
	RankVelocity             float64           `json:"rankVelocity"`
	RankVelocityScore        *float64          `json:"rankVelocityScore,omitempty"`
	ExposureScore            float64           `json:"exposureScore"`
	FreshnessScore           float64           `json:"freshnessScore"`
	CrossQueryStrength       float64           `json:"crossQueryStrength"`
	RelativeStrength         float64           `json:"relativeStrength"`
	QualityScore             *float64          `json:"qualityScore,omitempty"`
	OpportunityScore         float64           `json:"opportunityScore"`
	Direction                MarketDirection   `json:"direction"`
	ComparableHistory        bool              `json:"comparableHistory"`
	Confidence               float64           `json:"confidence"`
	Coverage                 float64           `json:"coverage"`
	Missing                  []string          `json:"missing,omitempty"`
	ModelVersion             string            `json:"modelVersion"`
	ModelRefs                map[string]string `json:"modelRefs"`
	DataQualityScore         float64           `json:"dataQualityScore"`
	DataQualityGrade         DataQualityGrade  `json:"dataQualityGrade"`
	DirectionStage           DirectionStage    `json:"directionStage"`
	ProvenanceID             string            `json:"provenanceId,omitempty"`
	MarketMapRunID           string            `json:"marketMapRunId,omitempty"`
	IntegrityStatus          IntegrityStatus   `json:"integrityStatus"`
}

type CatalogSnapshot struct {
	ID                        string            `json:"id"`
	CatalogID                 string            `json:"catalogId"`
	Window                    RankingWindow     `json:"window"`
	ObservedAt                string            `json:"observedAt"`
	ObservedProducts          int               `json:"observedProducts"`
	ObservedAuthors           int               `json:"observedAuthors"`
	NewProducts               int               `json:"newProducts"`
	PreviousNewProducts       int               `json:"previousNewProducts"`
	RisingProducts            int               `json:"risingProducts"`
	NeutralProducts           int               `json:"neutralProducts"`
	FallingProducts           int               `json:"fallingProducts"`
	ComparableProducts        int               `json:"comparableProducts"`
	MedianRankVelocity        float64           `json:"medianRankVelocity"`
	ExposureBreadth           float64           `json:"exposureBreadth"`
	DemandMomentumPercent     float64           `json:"demandMomentumPercent"`
	DemandMomentumIndex       float64           `json:"demandMomentumIndex"`
	NewSupplyVelocityPercent  float64           `json:"newSupplyVelocityPercent"`
	NewSupplyVelocityIndex    float64           `json:"newSupplyVelocityIndex"`
	CompetitionAcceleration   float64           `json:"competitionAcceleration"`
	CompetitionMomentumIndex  float64           `json:"competitionMomentumIndex"`
	AuthorConcentration       float64           `json:"authorConcentration"`
	AuthorAttributionCoverage float64           `json:"authorAttributionCoverage"`
	FreshnessIndex            float64           `json:"freshnessIndex"`
	RelativeStrength          float64           `json:"relativeStrength"`
	SupplyGap                 float64           `json:"supplyGap"`
	DirectionIndex            float64           `json:"directionIndex"`
	TrendScore                float64           `json:"trendScore"`
	OpportunityScore          float64           `json:"opportunityScore"`
	Direction                 MarketDirection   `json:"direction"`
	Confidence                float64           `json:"confidence"`
	Coverage                  float64           `json:"coverage"`
	Missing                   []string          `json:"missing,omitempty"`
	ModelVersion              string            `json:"modelVersion"`
	ModelRefs                 map[string]string `json:"modelRefs"`
	DataQualityScore          float64           `json:"dataQualityScore"`
	DataQualityGrade          DataQualityGrade  `json:"dataQualityGrade"`
	DirectionStage            DirectionStage    `json:"directionStage"`
	ProvenanceID              string            `json:"provenanceId,omitempty"`
	MarketMapRunID            string            `json:"marketMapRunId,omitempty"`
	IntegrityStatus           IntegrityStatus   `json:"integrityStatus"`
}

type RankingBuildRequest struct {
	MarketMapRunID string `json:"marketMapRunId,omitempty"`
	AsOf           string `json:"asOf,omitempty"`
	WindowDays     int    `json:"windowDays"`
	CatalogScopeID string `json:"catalogScopeId,omitempty"`
}

type RankingBuildResult struct {
	Window            RankingWindow     `json:"window"`
	CatalogSnapshots  []CatalogSnapshot `json:"catalogSnapshots"`
	ProductSnapshots  []ProductSnapshot `json:"productSnapshots"`
	CatalogsPersisted int               `json:"catalogsPersisted"`
	ProductsPersisted int               `json:"productsPersisted"`
}

type ProductSnapshotFilter struct {
	ProductID    string
	CatalogID    string
	WindowDays   int
	AsOf         string
	ModelVersion string
}

type CatalogSnapshotFilter struct {
	CatalogID    string
	ParentID     string
	WindowDays   int
	AsOf         string
	ModelVersion string
}
