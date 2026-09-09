package domain

import (
	"regexp"
	"strings"
)

type MarketSurface string

const (
	MarketSurfaceNew       MarketSurface = "new"
	MarketSurfaceRandomNew MarketSurface = "random_new"
	MarketSurfacePopular   MarketSurface = "popular"
	MarketSurfaceFeatured  MarketSurface = "featured"
	MarketSurfaceSearch    MarketSurface = "search"
	MarketSurfaceCategory  MarketSurface = "category"
	MarketSurfaceSimilar   MarketSurface = "similar"
)

type MarketMapTargetStatus string

const (
	MarketMapTargetCompleted MarketMapTargetStatus = "completed"
	MarketMapTargetPartial   MarketMapTargetStatus = "partial"
	MarketMapTargetFailed    MarketMapTargetStatus = "failed"
	MarketMapTargetSkipped   MarketMapTargetStatus = "skipped"
)

type MarketMapTargetResult struct {
	ID             string                `json:"id"`
	RunID          string                `json:"runId"`
	TargetID       string                `json:"targetId"`
	StratumKey     string                `json:"stratumKey"`
	Status         MarketMapTargetStatus `json:"status"`
	RequestsUsed   int                   `json:"requestsUsed"`
	ObservedItems  int                   `json:"observedItems"`
	UniqueProducts int                   `json:"uniqueProducts"`
	FailureCode    string                `json:"failureCode,omitempty"`
	CompletedAt    string                `json:"completedAt"`
}

type CatalogOrigin string

const (
	CatalogOriginManual    CatalogOrigin = "manual"
	CatalogOriginScanner   CatalogOrigin = "scanner"
	CatalogOriginMigration CatalogOrigin = "migration"
)

type SegmentLevel string

const (
	SegmentLevelGlobal      SegmentLevel = "global"
	SegmentLevelSite        SegmentLevel = "site"
	SegmentLevelContentType SegmentLevel = "content_type"
	SegmentLevelCatalog     SegmentLevel = "catalog"
	SegmentLevelProductType SegmentLevel = "product_type"
	SegmentLevelUseCase     SegmentLevel = "use_case"
)

type DirectionStage string

const (
	DirectionStageComposition DirectionStage = "composition"
	DirectionStageMovement    DirectionStage = "movement"
	DirectionStagePreliminary DirectionStage = "preliminary"
	DirectionStageEstablished DirectionStage = "established"
)

type DataQualityGrade string

const (
	DataQualityGradeA DataQualityGrade = "A"
	DataQualityGradeB DataQualityGrade = "B"
	DataQualityGradeC DataQualityGrade = "C"
	DataQualityGradeD DataQualityGrade = "D"
)

type IndexDivergenceState string

const (
	IndexDivergenceAligned      IndexDivergenceState = "aligned"
	IndexDivergenceModerate     IndexDivergenceState = "moderate"
	IndexDivergenceConcentrated IndexDivergenceState = "concentrated"
)

type IntegrityStatus string

const (
	IntegrityStatusNativeAlpha65 IntegrityStatus = "native_alpha6_5"
	IntegrityStatusRecalculated  IntegrityStatus = "recalculated"
	IntegrityStatusLegacy        IntegrityStatus = "legacy_unsegmented"
	IntegrityStatusNeedsReview   IntegrityStatus = "needs_review"
	IntegrityStatusExcluded      IntegrityStatus = "excluded_from_ranking"
)

var surfaceAliasNormalizer = regexp.MustCompile(`[^a-z0-9]+`)
var surfaceAliases = map[string]MarketSurface{
	"new":        MarketSurfaceNew,
	"random-new": MarketSurfaceRandomNew,
	"popular":    MarketSurfacePopular,
	"featured":   MarketSurfaceFeatured,
	"search":     MarketSurfaceSearch,
	"category":   MarketSurfaceCategory,
	"similar":    MarketSurfaceSimilar,
}

func NormalizeMarketSurfaceAlias(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Trim(surfaceAliasNormalizer.ReplaceAllString(value, "-"), "-")
}

func ParseMarketSurfaceAlias(value string) (MarketSurface, bool) {
	surface, ok := surfaceAliases[NormalizeMarketSurfaceAlias(value)]
	return surface, ok
}

type DistributionShare struct {
	Key   string  `json:"key"`
	Label string  `json:"label,omitempty"`
	Count int     `json:"count"`
	Share float64 `json:"share"`
}

type StratumAudit struct {
	Key             string        `json:"key"`
	TargetID        string        `json:"targetId"`
	Site            string        `json:"site"`
	ContentType     string        `json:"contentType,omitempty"`
	CatalogID       string        `json:"catalogId,omitempty"`
	Surface         MarketSurface `json:"surface"`
	TargetSample    int           `json:"targetSample"`
	ObservedItems   int           `json:"observedItems"`
	UniqueProducts  int           `json:"uniqueProducts"`
	RequestsAllowed int           `json:"requestsAllowed"`
	RequestsUsed    int           `json:"requestsUsed"`
	Completed       bool          `json:"completed"`
	HighPriority    bool          `json:"highPriority"`
	Reliability     float64       `json:"reliability"`
	FailureCode     string        `json:"failureCode,omitempty"`
}

type SampleAudit struct {
	ID                      string              `json:"id"`
	RunID                   string              `json:"runId"`
	PlannerVersion          string              `json:"plannerVersion"`
	SamplingSchemaVersion   string              `json:"samplingSchemaVersion"`
	TaxonomyVersion         string              `json:"taxonomyVersion"`
	TargetStrata            int                 `json:"targetStrata"`
	CompletedStrata         int                 `json:"completedStrata"`
	TargetSample            int                 `json:"targetSample"`
	UniqueProducts          int                 `json:"uniqueProducts"`
	TotalObservations       int                 `json:"totalObservations"`
	StratumCompletionRate   float64             `json:"stratumCompletionRate"`
	SampleSizeAdequacy      float64             `json:"sampleSizeAdequacy"`
	SampleBalanceScore      float64             `json:"sampleBalanceScore"`
	UniqueProductRatio      float64             `json:"uniqueProductRatio"`
	DuplicateRate           float64             `json:"duplicateRate"`
	TaxonomyCoverage        float64             `json:"taxonomyCoverage"`
	TaxonomyConfidence      float64             `json:"taxonomyConfidence"`
	AuthorCoverage          float64             `json:"authorCoverage"`
	SourceReliability       float64             `json:"sourceReliability"`
	SurfaceDiversityScore   float64             `json:"surfaceDiversityScore"`
	DominantSiteShare       float64             `json:"dominantSiteShare"`
	DominantCatalogShare    float64             `json:"dominantCatalogShare"`
	HighPriorityComplete    bool                `json:"highPriorityComplete"`
	SiteDistribution        []DistributionShare `json:"siteDistribution"`
	ContentTypeDistribution []DistributionShare `json:"contentTypeDistribution"`
	CatalogDistribution     []DistributionShare `json:"catalogDistribution"`
	SurfaceDistribution     []DistributionShare `json:"surfaceDistribution"`
	Strata                  []StratumAudit      `json:"strata"`
	ReasonCodes             []string            `json:"reasonCodes,omitempty"`
	GeneratedAt             string              `json:"generatedAt"`
}

type DataQualityComponents struct {
	StratumCompletion float64 `json:"stratumCompletion"`
	SampleSize        float64 `json:"sampleSize"`
	SampleBalance     float64 `json:"sampleBalance"`
	UniqueProduct     float64 `json:"uniqueProduct"`
	Taxonomy          float64 `json:"taxonomy"`
	AuthorCoverage    float64 `json:"authorCoverage"`
	SourceReliability float64 `json:"sourceReliability"`
	HistoryDepth      float64 `json:"historyDepth"`
	SurfaceDiversity  float64 `json:"surfaceDiversity"`
}

type DataQualityAssessment struct {
	ID           string                `json:"id"`
	RunID        string                `json:"runId"`
	EntityType   string                `json:"entityType"`
	EntityID     string                `json:"entityId"`
	Score        float64               `json:"score"`
	Grade        DataQualityGrade      `json:"grade"`
	Components   DataQualityComponents `json:"components"`
	CapsApplied  []string              `json:"capsApplied,omitempty"`
	ReasonCodes  []string              `json:"reasonCodes,omitempty"`
	ModelVersion string                `json:"modelVersion"`
	GeneratedAt  string                `json:"generatedAt"`
}

type ObservationSegmentation struct {
	ID              string          `json:"id"`
	ObservationID   string          `json:"observationId"`
	RunID           string          `json:"runId"`
	ProductID       string          `json:"productId"`
	Site            string          `json:"site"`
	ContentType     string          `json:"contentType"`
	CatalogID       string          `json:"catalogId,omitempty"`
	ProductType     string          `json:"productType,omitempty"`
	UseCase         string          `json:"useCase,omitempty"`
	Topic           string          `json:"topic,omitempty"`
	Style           string          `json:"style,omitempty"`
	Confidence      float64         `json:"confidence"`
	Status          IntegrityStatus `json:"status"`
	ReasonCodes     []string        `json:"reasonCodes,omitempty"`
	TaxonomyVersion string          `json:"taxonomyVersion"`
	GeneratedAt     string          `json:"generatedAt"`
}

type MarketIndexSnapshot struct {
	ID                  string               `json:"id"`
	RunID               string               `json:"runId"`
	PriorRunID          string               `json:"priorRunId,omitempty"`
	Level               SegmentLevel         `json:"level"`
	EntityID            string               `json:"entityId"`
	ParentID            string               `json:"parentId,omitempty"`
	Label               string               `json:"label"`
	CompositionIndex    float64              `json:"compositionIndex"`
	VolumeWeightedValue float64              `json:"volumeWeightedValue"`
	EqualSectorValue    float64              `json:"equalSectorValue"`
	DivergenceValue     float64              `json:"divergenceValue"`
	DivergenceState     IndexDivergenceState `json:"divergenceState"`
	Direction           string               `json:"direction,omitempty"`
	DirectionStage      DirectionStage       `json:"directionStage"`
	TrendScore          *float64             `json:"trendScore,omitempty"`
	OpportunityScore    *float64             `json:"opportunityScore,omitempty"`
	Coverage            float64              `json:"coverage"`
	Confidence          float64              `json:"confidence"`
	DataQualityScore    float64              `json:"dataQualityScore"`
	DataQualityGrade    DataQualityGrade     `json:"dataQualityGrade"`
	ComparableRuns      int                  `json:"comparableRuns"`
	SampleSize          int                  `json:"sampleSize"`
	ProvenanceID        string               `json:"provenanceId"`
	ModelVersion        string               `json:"modelVersion"`
	WeightSetVersion    string               `json:"weightSetVersion"`
	IntegrityStatus     IntegrityStatus      `json:"integrityStatus"`
	GeneratedAt         string               `json:"generatedAt"`
}

type ScoreComponent struct {
	Name            string  `json:"name"`
	RawValue        float64 `json:"rawValue"`
	NormalizedValue float64 `json:"normalizedValue"`
	OriginalWeight  float64 `json:"originalWeight"`
	EffectiveWeight float64 `json:"effectiveWeight"`
	Contribution    float64 `json:"contribution"`
	Missing         bool    `json:"missing"`
	ReasonCode      string  `json:"reasonCode,omitempty"`
}

type ScoreProvenance struct {
	ID                    string              `json:"id"`
	RunID                 string              `json:"runId"`
	PriorRunID            string              `json:"priorRunId,omitempty"`
	ScoreType             string              `json:"scoreType"`
	EntityType            string              `json:"entityType"`
	EntityID              string              `json:"entityId"`
	PlannerVersion        string              `json:"plannerVersion"`
	SamplingSchemaVersion string              `json:"samplingSchemaVersion"`
	TaxonomyVersion       string              `json:"taxonomyVersion"`
	WeightSetVersion      string              `json:"weightSetVersion"`
	ModelVersion          string              `json:"modelVersion"`
	FinalScore            float64             `json:"finalScore"`
	OriginalWeightTotal   float64             `json:"originalWeightTotal"`
	EffectiveWeightTotal  float64             `json:"effectiveWeightTotal"`
	Parameters            map[string]float64  `json:"parameters,omitempty"`
	SampleSize            int                 `json:"sampleSize"`
	UniqueProducts        int                 `json:"uniqueProducts"`
	SiteDistribution      []DistributionShare `json:"siteDistribution"`
	CatalogDistribution   []DistributionShare `json:"catalogDistribution"`
	SurfaceDistribution   []DistributionShare `json:"surfaceDistribution"`
	DuplicateRate         float64             `json:"duplicateRate"`
	Coverage              float64             `json:"coverage"`
	Confidence            float64             `json:"confidence"`
	DataQualityScore      float64             `json:"dataQualityScore"`
	DataQualityGrade      DataQualityGrade    `json:"dataQualityGrade"`
	Components            []ScoreComponent    `json:"components"`
	MissingComponents     []string            `json:"missingComponents,omitempty"`
	FallbackRules         []string            `json:"fallbackRules,omitempty"`
	ReasonCodes           []string            `json:"reasonCodes,omitempty"`
	GeneratedAt           string              `json:"generatedAt"`
}

type LegacyClassificationReview struct {
	ID                   string        `json:"id"`
	CatalogID            string        `json:"catalogId"`
	CatalogName          string        `json:"catalogName"`
	CanonicalKey         string        `json:"canonicalKey"`
	DetectedSurface      MarketSurface `json:"detectedSurface,omitempty"`
	Action               string        `json:"action"`
	Status               string        `json:"status"`
	SourceObservationIDs []string      `json:"sourceObservationIds,omitempty"`
	ReasonCodes          []string      `json:"reasonCodes,omitempty"`
	CreatedAt            string        `json:"createdAt"`
	ResolvedAt           string        `json:"resolvedAt,omitempty"`
}

type ObservationSegmentationFilter struct{ ObservationID, RunID, ProductID, TaxonomyVersion string }
type SampleAuditFilter struct{ ID, RunID string }
type DataQualityFilter struct{ ID, RunID, EntityType, EntityID string }
type MarketIndexFilter struct {
	ID, RunID, PriorRunID, EntityID string
	Level                           SegmentLevel
	IntegrityStatus                 IntegrityStatus
}
type ScoreProvenanceFilter struct{ ID, RunID, ScoreType, EntityType, EntityID string }
type LegacyClassificationReviewFilter struct{ ID, CatalogID, Status string }
