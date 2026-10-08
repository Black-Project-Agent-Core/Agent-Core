package domain

// ScanStage is a canonical phase of one Market Autopilot mapping run.
type ScanStage string

const (
	StagePreparingScanPlan       ScanStage = "preparing_scan_plan"
	StageValidatingSources       ScanStage = "validating_sources"
	StageLoadingCatalogStructure ScanStage = "loading_catalog_structure"
	StageMappingMarketSurfaces   ScanStage = "mapping_market_surfaces"
	StageNormalizingProducts     ScanStage = "normalizing_products"
	StageDeduplicating           ScanStage = "deduplicating"
	StageTaxonomySegmentation    ScanStage = "taxonomy_segmentation"
	StageSignalQualityAudit      ScanStage = "signal_quality_audit"
	StageRankingConsensus        ScanStage = "ranking_consensus"
	StagePersistingHistory       ScanStage = "persisting_history"
	StageFinalizingMarketMap     ScanStage = "finalizing_market_map"
)

func CanonicalScanStages() []ScanStage {
	return []ScanStage{
		StagePreparingScanPlan,
		StageValidatingSources,
		StageLoadingCatalogStructure,
		StageMappingMarketSurfaces,
		StageNormalizingProducts,
		StageDeduplicating,
		StageTaxonomySegmentation,
		StageSignalQualityAudit,
		StageRankingConsensus,
		StagePersistingHistory,
		StageFinalizingMarketMap,
	}
}

type ScanStageStatus string

const (
	ScanStageWaiting   ScanStageStatus = "waiting"
	ScanStageRunning   ScanStageStatus = "running"
	ScanStageCompleted ScanStageStatus = "completed"
	ScanStageWarning   ScanStageStatus = "warning"
	ScanStageFailed    ScanStageStatus = "failed"
)

type TelemetrySeverity string

const (
	TelemetryInfo    TelemetrySeverity = "info"
	TelemetryWarning TelemetrySeverity = "warning"
	TelemetryError   TelemetrySeverity = "error"
)

type ETAConfidence string

const (
	ETAConfidenceUnavailable ETAConfidence = "unavailable"
	ETAConfidenceLow         ETAConfidence = "low"
	ETAConfidenceMedium      ETAConfidence = "medium"
	ETAConfidenceHigh        ETAConfidence = "high"
)

type ETAEstimateKind string

const (
	ETAUnavailable ETAEstimateKind = "unavailable"
	ETARange       ETAEstimateKind = "range"
	ETAPoint       ETAEstimateKind = "point"
)

// ScanTelemetryEvent intentionally contains normalized runtime facts only.
type ScanTelemetryEvent struct {
	RunID          string            `json:"runId"`
	Sequence       int64             `json:"sequence"`
	At             string            `json:"at"`
	Stage          ScanStage         `json:"stage"`
	Severity       TelemetrySeverity `json:"severity"`
	Code           string            `json:"code"`
	MessageKey     string            `json:"messageKey,omitempty"`
	Site           string            `json:"site,omitempty"`
	Surface        string            `json:"surface,omitempty"`
	Catalog        string            `json:"catalog,omitempty"`
	RequestNumber  int               `json:"requestNumber,omitempty"`
	HTTPStatus     int               `json:"httpStatus,omitempty"`
	LatencyMs      int64             `json:"latencyMs,omitempty"`
	RetryCount     int               `json:"retryCount,omitempty"`
	RetryDelayMs   int64             `json:"retryDelayMs,omitempty"`
	ItemsReceived  int               `json:"itemsReceived,omitempty"`
	UniqueProducts int               `json:"uniqueProducts,omitempty"`
	Detail         string            `json:"detail,omitempty"`
}

type ScanStageSnapshot struct {
	Stage       ScanStage       `json:"stage"`
	Status      ScanStageStatus `json:"status"`
	StartedAt   string          `json:"startedAt,omitempty"`
	CompletedAt string          `json:"completedAt,omitempty"`
	Warnings    int             `json:"warnings,omitempty"`
	Errors      int             `json:"errors,omitempty"`
}

type ETAEstimate struct {
	Kind                 ETAEstimateKind `json:"kind"`
	Confidence           ETAConfidence   `json:"confidence"`
	EstimatedRemainingMs int64           `json:"estimatedRemainingMs,omitempty"`
	MinimumRemainingMs   int64           `json:"minimumRemainingMs,omitempty"`
	MaximumRemainingMs   int64           `json:"maximumRemainingMs,omitempty"`
	ExpectedFinishAt     string          `json:"expectedFinishAt,omitempty"`
	EvidenceRuns         int             `json:"evidenceRuns"`
	Basis                string          `json:"basis,omitempty"`
}

type RuntimeCompatibility struct {
	PlannerVersion        string   `json:"plannerVersion"`
	SamplingSchemaVersion string   `json:"samplingSchemaVersion"`
	TaxonomyVersion       string   `json:"taxonomyVersion"`
	IndexWeightingVersion string   `json:"indexWeightingVersion"`
	Sites                 []string `json:"sites,omitempty"`
	Surfaces              []string `json:"surfaces,omitempty"`
	PlannedWorkUnits      int      `json:"plannedWorkUnits,omitempty"`
}

type ScanRuntimeSnapshot struct {
	RunID                string               `json:"runId"`
	Status               MarketMapRunStatus   `json:"status"`
	StartedAt            string               `json:"startedAt"`
	UpdatedAt            string               `json:"updatedAt"`
	CurrentStage         ScanStage            `json:"currentStage,omitempty"`
	Stages               []ScanStageSnapshot  `json:"stages"`
	PlannedWorkUnits     int                  `json:"plannedWorkUnits"`
	CompletedWorkUnits   int                  `json:"completedWorkUnits"`
	ProgressDeterminate  bool                 `json:"progressDeterminate"`
	ProgressPercent      float64              `json:"progressPercent"`
	ProductsDiscovered   int                  `json:"productsDiscovered"`
	RequestsCompleted    int                  `json:"requestsCompleted"`
	RequestsPlanned      int                  `json:"requestsPlanned,omitempty"`
	ElapsedMs            int64                `json:"elapsedMs"`
	ETA                  ETAEstimate          `json:"eta"`
	WarningCount         int                  `json:"warningCount"`
	ErrorCount           int                  `json:"errorCount"`
	LastSequence         int64                `json:"lastSequence"`
	RuntimeCompatibility RuntimeCompatibility `json:"runtimeCompatibility"`
}

type ScanRuntimeSummary struct {
	RunID              string               `json:"runId"`
	Status             MarketMapRunStatus   `json:"status"`
	StartedAt          string               `json:"startedAt"`
	CompletedAt        string               `json:"completedAt"`
	DurationMs         int64                `json:"durationMs"`
	PlannedWorkUnits   int                  `json:"plannedWorkUnits"`
	CompletedWorkUnits int                  `json:"completedWorkUnits"`
	ProductsDiscovered int                  `json:"productsDiscovered"`
	RequestsCompleted  int                  `json:"requestsCompleted"`
	AverageLatencyMs   float64              `json:"averageLatencyMs,omitempty"`
	P50LatencyMs       float64              `json:"p50LatencyMs,omitempty"`
	P95LatencyMs       float64              `json:"p95LatencyMs,omitempty"`
	RetryCount         int                  `json:"retryCount"`
	RetryDelayMs       int64                `json:"retryDelayMs"`
	WarningCount       int                  `json:"warningCount"`
	ErrorCount         int                  `json:"errorCount"`
	StageDurationMs    map[string]int64     `json:"stageDurationMs,omitempty"`
	SourceDurationMs   map[string]int64     `json:"sourceDurationMs,omitempty"`
	SurfaceDurationMs  map[string]int64     `json:"surfaceDurationMs,omitempty"`
	Compatibility      RuntimeCompatibility `json:"compatibility"`
}
