package domain

type MarketMapMode string

const (
	MarketMapModeQuick    MarketMapMode = "quick"
	MarketMapModeStandard MarketMapMode = "standard"
	MarketMapModeDeep     MarketMapMode = "deep"
)

type MarketMapRunStatus string

const (
	MarketMapRunPlanned   MarketMapRunStatus = "planned"
	MarketMapRunRunning   MarketMapRunStatus = "running"
	MarketMapRunCompleted MarketMapRunStatus = "completed"
	MarketMapRunPartial   MarketMapRunStatus = "partial"
	MarketMapRunFailed    MarketMapRunStatus = "failed"
	MarketMapRunCancelled MarketMapRunStatus = "cancelled"
)

type MarketMapSurfaceTarget struct {
	ID               string        `json:"id"`
	Site             string        `json:"site"`
	Surface          MarketSurface `json:"surface"`
	Category         string        `json:"category,omitempty"`
	CategoryName     string        `json:"categoryName,omitempty"`
	ContentType      string        `json:"contentType,omitempty"`
	PageSize         int           `json:"pageSize,omitempty"`
	Priority         int           `json:"priority,omitempty"`
	RequestAllowance int           `json:"requestAllowance,omitempty"`
	StratumKey       string        `json:"stratumKey"`
	TargetSample     int           `json:"targetSample"`
	HighPriority     bool          `json:"highPriority"`
	CatalogLevelKey  string        `json:"catalogLevelKey,omitempty"`
}

type MarketMapPlan struct {
	ID                    string                   `json:"id"`
	CreatedAt             string                   `json:"createdAt"`
	Mode                  MarketMapMode            `json:"mode,omitempty"`
	ScanMode              MarketMapMode            `json:"scanMode"`
	PlannerVersion        string                   `json:"plannerVersion"`
	CompatibilityKey      string                   `json:"compatibilityKey"`
	ScopeLabel            string                   `json:"scopeLabel"`
	Sites                 []string                 `json:"sites"`
	RequestBudget         int                      `json:"requestBudget"`
	Targets               []MarketMapSurfaceTarget `json:"targets"`
	SamplingSchemaVersion string                   `json:"samplingSchemaVersion"`
	TaxonomyVersion       string                   `json:"taxonomyVersion"`
	IndexWeightingVersion string                   `json:"indexWeightingVersion"`
}

type MarketMapRun struct {
	ID                    string             `json:"id"`
	PlanID                string             `json:"planId"`
	Mode                  MarketMapMode      `json:"mode"`
	CompatibilityKey      string             `json:"compatibilityKey"`
	SamplingSchemaVersion string             `json:"samplingSchemaVersion"`
	TaxonomyVersion       string             `json:"taxonomyVersion"`
	IndexWeightingVersion string             `json:"indexWeightingVersion"`
	StartedAt             string             `json:"startedAt"`
	CompletedAt           string             `json:"completedAt,omitempty"`
	Status                MarketMapRunStatus `json:"status"`
	RequestsUsed          int                `json:"requestsUsed"`
	TargetsPlanned        int                `json:"targetsPlanned"`
	TargetsCompleted      int                `json:"targetsCompleted"`
	ObservationsCollected int                `json:"observationsCollected"`
	ProductsObserved      int                `json:"productsObserved"`
	AuthorsObserved       int                `json:"authorsObserved"`
	Coverage              float64            `json:"coverage"`
	Confidence            float64            `json:"confidence"`
	DirectionAvailable    bool               `json:"directionAvailable"`
	DirectionStage        DirectionStage     `json:"directionStage"`
	ComparableRunCount    int                `json:"comparableRunCount"`
	SampleAuditID         string             `json:"sampleAuditId,omitempty"`
	GlobalIndexID         string             `json:"globalIndexId,omitempty"`
	IntegrityStatus       IntegrityStatus    `json:"integrityStatus"`
	RankingAsOf           string             `json:"rankingAsOf,omitempty"`
	Errors                []string           `json:"errors,omitempty"`
}

type MarketSurfaceObservation struct {
	ID             string        `json:"id"`
	RunID          string        `json:"runId"`
	TargetID       string        `json:"targetId"`
	Site           string        `json:"site"`
	Surface        MarketSurface `json:"surface"`
	Category       string        `json:"category,omitempty"`
	ExternalItemID string        `json:"externalItemId"`
	ProductID      string        `json:"productId,omitempty"`
	AuthorID       string        `json:"authorId,omitempty"`
	Position       int           `json:"position,omitempty"`
	ObservedAt     string        `json:"observedAt"`
	Reliability    float64       `json:"reliability"`
}

type MarketDirectionSnapshot struct {
	ID              string   `json:"id"`
	RunID           string   `json:"runId"`
	PriorRunID      string   `json:"priorRunId,omitempty"`
	AsOf            string   `json:"asOf"`
	Temperature     float64  `json:"temperature"`
	Direction       string   `json:"direction"`
	Status          string   `json:"status,omitempty"`
	CompositionOnly bool     `json:"compositionOnly"`
	Coverage        float64  `json:"coverage"`
	Confidence      float64  `json:"confidence"`
	ModelVersion    string   `json:"modelVersion"`
	ReasonCodes     []string `json:"reasonCodes,omitempty"`
}

type ProductSourceLink struct {
	ProductID         string                 `json:"productId"`
	ExternalItemID    string                 `json:"externalItemId,omitempty"`
	Title             string                 `json:"title"`
	AuthorDisplayName string                 `json:"authorDisplayName,omitempty"`
	SourceURL         string                 `json:"sourceUrl,omitempty"`
	LinkAvailable     bool                   `json:"linkAvailable"`
	OpportunityScore  float64                `json:"opportunityScore,omitempty"`
	Confidence        float64                `json:"confidence,omitempty"`
	ExposureScore     float64                `json:"exposureScore,omitempty"`
	FreshnessScore    float64                `json:"freshnessScore,omitempty"`
	Direction         MarketDirection        `json:"direction,omitempty"`
	Temporal          ProductTemporalSummary `json:"temporal"`
}

type ProductDirectionSourceProducts struct {
	DirectionID    string              `json:"directionId"`
	Label          string              `json:"label"`
	ProductCount   int                 `json:"productCount"`
	AvailableCount int                 `json:"availableCount"`
	Products       []ProductSourceLink `json:"products"`
}

type ProductDirectionLinkSummary struct {
	DirectionID    string             `json:"directionId"`
	Mode           string             `json:"mode"`
	ProductCount   int                `json:"productCount"`
	AvailableCount int                `json:"availableCount"`
	Representative *ProductSourceLink `json:"representative,omitempty"`
}

type ProductDirectionCluster struct {
	ID                 string              `json:"id"`
	RunID              string              `json:"runId"`
	Key                string              `json:"key"`
	Label              string              `json:"label"`
	CatalogID          string              `json:"catalogId,omitempty"`
	ProductType        string              `json:"productType,omitempty"`
	UseCase            string              `json:"useCase,omitempty"`
	Theme              string              `json:"theme,omitempty"`
	Keywords           []string            `json:"keywords,omitempty"`
	EvidenceProductIDs []string            `json:"evidenceProductIds,omitempty"`
	ProductIDs         []string            `json:"productIds,omitempty"`
	ProductCount       int                 `json:"productCount"`
	AuthorCount        int                 `json:"authorCount"`
	Freshness          float64             `json:"freshness"`
	Opportunity        float64             `json:"opportunity"`
	Coverage           float64             `json:"coverage"`
	Confidence         float64             `json:"confidence"`
	NeedsReview        bool                `json:"needsReview"`
	ModelVersion       string              `json:"modelVersion"`
	DataQualityScore   float64             `json:"dataQualityScore"`
	DataQualityGrade   DataQualityGrade    `json:"dataQualityGrade"`
	DirectionStage     DirectionStage      `json:"directionStage"`
	ProvenanceID       string              `json:"provenanceId,omitempty"`
	IntegrityStatus    IntegrityStatus     `json:"integrityStatus"`
	SourceProducts     []ProductSourceLink `json:"sourceProducts,omitempty"`
	PrimaryProduct     *ProductSourceLink  `json:"primaryProduct,omitempty"`
}

type ProductionInsight struct {
	ID               string           `json:"id"`
	RunID            string           `json:"runId"`
	CatalogID        string           `json:"catalogId,omitempty"`
	EntityType       string           `json:"entityType,omitempty"`
	EntityID         string           `json:"entityId,omitempty"`
	ClusterID        string           `json:"clusterId,omitempty"`
	Code             string           `json:"code"`
	Recommendation   string           `json:"recommendation"`
	Priority         float64          `json:"priority"`
	Score            float64          `json:"score,omitempty"`
	Trend            float64          `json:"trend"`
	Opportunity      float64          `json:"opportunity"`
	Coverage         float64          `json:"coverage"`
	Confidence       float64          `json:"confidence"`
	ReasonCodes      []string         `json:"reasonCodes,omitempty"`
	RiskCodes        []string         `json:"riskCodes,omitempty"`
	ModelVersion     string           `json:"modelVersion"`
	DataQualityScore float64          `json:"dataQualityScore"`
	DataQualityGrade DataQualityGrade `json:"dataQualityGrade"`
	DirectionStage   DirectionStage   `json:"directionStage"`
	ProvenanceID     string           `json:"provenanceId,omitempty"`
	IntegrityStatus  IntegrityStatus  `json:"integrityStatus"`
}

type SaturationAlert struct {
	ID               string           `json:"id"`
	RunID            string           `json:"runId"`
	CatalogID        string           `json:"catalogId,omitempty"`
	EntityType       string           `json:"entityType,omitempty"`
	EntityID         string           `json:"entityId,omitempty"`
	ClusterID        string           `json:"clusterId,omitempty"`
	Code             string           `json:"code"`
	Severity         string           `json:"severity"`
	Trend            float64          `json:"trend"`
	Supply           float64          `json:"supply"`
	Competition      float64          `json:"competition"`
	Breadth          float64          `json:"breadth"`
	ReasonCodes      []string         `json:"reasonCodes,omitempty"`
	ModelVersion     string           `json:"modelVersion"`
	DataQualityScore float64          `json:"dataQualityScore"`
	DataQualityGrade DataQualityGrade `json:"dataQualityGrade"`
	DirectionStage   DirectionStage   `json:"directionStage"`
	ProvenanceID     string           `json:"provenanceId,omitempty"`
	IntegrityStatus  IntegrityStatus  `json:"integrityStatus"`
}

type AdvancedResearchSeed struct {
	ID            string           `json:"id"`
	RunID         string           `json:"runId"`
	SourceType    string           `json:"sourceType"`
	SourceID      string           `json:"sourceId"`
	CreatedAt     string           `json:"createdAt"`
	Catalog       CatalogPathInput `json:"catalog"`
	Keywords      []string         `json:"keywords"`
	Site          string           `json:"site"`
	Category      string           `json:"category,omitempty"`
	MaxPages      int              `json:"maxPages"`
	PageSize      int              `json:"pageSize"`
	RequestBudget int              `json:"requestBudget"`
	WindowDays    int              `json:"windowDays"`
}

type ClassificationReview struct {
	ID              string   `json:"id"`
	RunID           string   `json:"runId"`
	ProductID       string   `json:"productId"`
	Title           string   `json:"title,omitempty"`
	Reason          string   `json:"reason"`
	CandidateLabels []string `json:"candidateLabels,omitempty"`
	CreatedAt       string   `json:"createdAt"`
	Status          string   `json:"status"`
}

type SurfaceBreakdownRow struct {
	Surface          MarketSurface `json:"surface"`
	Observations     int           `json:"observations"`
	UniqueProducts   int           `json:"uniqueProducts"`
	TargetsCompleted int           `json:"targetsCompleted"`
	TargetsFailed    int           `json:"targetsFailed"`
	DuplicateRate    float64       `json:"duplicateRate"`
	Reliability      float64       `json:"reliability"`
	Contribution     float64       `json:"contribution"`
}

type IntegritySummary struct {
	SampleAudit       SampleAudit             `json:"sampleAudit"`
	GlobalIndex       MarketIndexSnapshot     `json:"globalIndex"`
	IndexHierarchy    []MarketIndexSnapshot   `json:"indexHierarchy"`
	DataQuality       []DataQualityAssessment `json:"dataQuality"`
	SurfaceBreakdown  []SurfaceBreakdownRow   `json:"surfaceBreakdown"`
	ComparableRuns    int                     `json:"comparableRuns"`
	LegacyReviewCount int                     `json:"legacyReviewCount"`
}

type MarketAutopilotView struct {
	Plan           MarketMapPlan                 `json:"plan"`
	Run            MarketMapRun                  `json:"run"`
	Direction      *MarketDirectionSnapshot      `json:"direction,omitempty"`
	Catalogs       []CatalogSnapshot             `json:"catalogs"`
	Products       []ProductSnapshot             `json:"products"`
	Directions     []ProductDirectionCluster     `json:"productDirections"`
	DirectionLinks []ProductDirectionLinkSummary `json:"productDirectionLinks,omitempty"`
	Insights       []ProductionInsight           `json:"productionInsights"`
	Alerts         []SaturationAlert             `json:"saturationAlerts"`
	Reviews        []ClassificationReview        `json:"classificationReviews"`
	Integrity      *IntegritySummary             `json:"integrity,omitempty"`
}

type ProductTrendWindowSummary struct {
	WindowDays       int             `json:"windowDays"`
	Active           bool            `json:"active"`
	EventType        TrendEventType  `json:"eventType,omitempty"`
	LastEventAt      string          `json:"lastEventAt,omitempty"`
	LastTrendSeenAt  string          `json:"lastTrendSeenAt,omitempty"`
	TrendScore       float64         `json:"trendScore,omitempty"`
	OpportunityScore float64         `json:"opportunityScore,omitempty"`
	ExposureScore    float64         `json:"exposureScore,omitempty"`
	Direction        MarketDirection `json:"direction,omitempty"`
}

type ProductTemporalSummary struct {
	ProductID          string                            `json:"productId"`
	ReleaseAvailable   bool                              `json:"releaseAvailable"`
	ReleasedAt         string                            `json:"releasedAt,omitempty"`
	ReleasePrecision   ReleasePrecision                  `json:"releasePrecision,omitempty"`
	ReleaseSourceType  string                            `json:"releaseSourceType,omitempty"`
	ReleaseSourceField string                            `json:"releaseSourceField,omitempty"`
	ReleaseVerifiedAt  string                            `json:"releaseVerifiedAt,omitempty"`
	ReleaseConflict    bool                              `json:"releaseConflict"`
	ReleaseStatus      string                            `json:"releaseStatus"`
	FirstDetectedAt    string                            `json:"firstDetectedAt,omitempty"`
	LastScannedAt      string                            `json:"lastScannedAt,omitempty"`
	LastTrendSeenAt    string                            `json:"lastTrendSeenAt,omitempty"`
	ScanCount          int                               `json:"scanCount"`
	ActiveWindows      []int                             `json:"activeWindows"`
	WindowStates       map[int]ProductTrendWindowSummary `json:"windowStates"`
	LifecycleStatus    string                            `json:"lifecycleStatus"`
}

type MarketMapHistoryRow struct {
	RunID              string             `json:"runId"`
	PriorRunID         string             `json:"priorRunId,omitempty"`
	Mode               MarketMapMode      `json:"mode"`
	Status             MarketMapRunStatus `json:"status"`
	StartedAt          string             `json:"startedAt"`
	CompletedAt        string             `json:"completedAt,omitempty"`
	ProductsObserved   int                `json:"productsObserved"`
	AuthorsObserved    int                `json:"authorsObserved"`
	Coverage           float64            `json:"coverage"`
	Confidence         float64            `json:"confidence"`
	Temperature        float64            `json:"temperature,omitempty"`
	Direction          string             `json:"direction,omitempty"`
	CompositionOnly    bool               `json:"compositionOnly"`
	DirectionAvailable bool               `json:"directionAvailable"`
}
