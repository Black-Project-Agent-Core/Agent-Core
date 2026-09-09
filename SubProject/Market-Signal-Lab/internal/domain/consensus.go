package domain

type ObservationPlatform string
type ObservationExperience string
type ObservationAccessState string
type ObservationSourceMethod string
type ConsensusLabel string
type AmbiguityLabel string
type StabilityLabel string
type MarketSignalState string
type TemporalEvidenceStage string

const (
	ObservationPlatformSubscription            ObservationPlatform     = "envato_subscription"
	ObservationPlatformMarket                  ObservationPlatform     = "envato_market"
	ObservationPlatformBenchmark               ObservationPlatform     = "envato_internal_benchmark"
	ObservationExperiencePublic                ObservationExperience   = "public_web"
	ObservationExperienceSubscriber            ObservationExperience   = "subscriber_app"
	ObservationExperienceAPI                   ObservationExperience   = "market_api"
	ObservationExperienceContentOpportunities  ObservationExperience   = "content_opportunities"
	ObservationExperienceAdvancedResearch      ObservationExperience   = "advanced_research"
	ObservationExperienceManual                ObservationExperience   = "manual_import"
	ObservationAccessAnonymous                 ObservationAccessState  = "anonymous"
	ObservationAccessFree                      ObservationAccessState  = "free_account"
	ObservationAccessSubscriber                ObservationAccessState  = "active_subscriber"
	ObservationAccessToken                     ObservationAccessState  = "personal_token"
	ObservationAccessBenchmark                 ObservationAccessState  = "manual_benchmark"
	ObservationSourceOfficialAPI               ObservationSourceMethod = "official_api"
	ObservationSourcePageCapture               ObservationSourceMethod = "user_initiated_page_capture"
	ObservationSourceClipboard                 ObservationSourceMethod = "clipboard_import"
	ObservationSourceCSV                       ObservationSourceMethod = "csv_import"
	ObservationSourceManual                    ObservationSourceMethod = "manual_entry"
	ConsensusLabelStrong                       ConsensusLabel          = "strong"
	ConsensusLabelModerate                     ConsensusLabel          = "moderate"
	ConsensusLabelContextDependent             ConsensusLabel          = "context_dependent"
	ConsensusLabelFragmented                   ConsensusLabel          = "fragmented"
	AmbiguityLow                               AmbiguityLabel          = "low"
	AmbiguityModerate                          AmbiguityLabel          = "moderate"
	AmbiguityHigh                              AmbiguityLabel          = "high"
	AmbiguityExtreme                           AmbiguityLabel          = "extreme"
	StabilityStable                            StabilityLabel          = "stable"
	StabilityVariable                          StabilityLabel          = "variable"
	StabilityUnstable                          StabilityLabel          = "unstable"
	StabilityExtreme                           StabilityLabel          = "extreme"
	MarketSignalStableConsensus                MarketSignalState       = "stable_consensus"
	MarketSignalConceptConsensusItemDivergence MarketSignalState       = "concept_consensus_item_divergence"
	MarketSignalContextDependent               MarketSignalState       = "context_dependent"
	MarketSignalFragmentedAmbiguous            MarketSignalState       = "fragmented_ambiguous"
	MarketSignalEmergingCrossContext           MarketSignalState       = "emerging_cross_context"
	EvidenceCurrentComparison                  TemporalEvidenceStage   = "current_comparison"
	EvidenceVolatilityIndication               TemporalEvidenceStage   = "volatility_indication"
	EvidencePreliminaryConsensus               TemporalEvidenceStage   = "preliminary_consensus"
	EvidenceEstablishedConsensus               TemporalEvidenceStage   = "established_consensus"
	EvidenceSeasonalityCandidate               TemporalEvidenceStage   = "seasonality_candidate"
)

type SignalStateInput struct {
	OverallConsensus        float64
	ConceptConsensus        float64
	ItemConsensus           float64
	Volatility              float64
	ContextTypes            int
	ComparableSnapshots     int
	ComparableBatches       int
	DataQualityGrade        DataQualityGrade
	ContextDominance        float64
	PresenceGrowingContexts int
	ContextBreadthDeclining bool
}

type ContextFilter struct {
	Name   string   `json:"name"`
	Values []string `json:"values"`
}

type ObservationContext struct {
	ID                 string                  `json:"id"`
	ContextKey         string                  `json:"contextKey"`
	Platform           ObservationPlatform     `json:"platform"`
	Experience         ObservationExperience   `json:"experience"`
	AccessState        ObservationAccessState  `json:"accessState"`
	SourceMethod       ObservationSourceMethod `json:"sourceMethod"`
	SourceSite         string                  `json:"sourceSite"`
	CatalogPath        string                  `json:"catalogPath"`
	ContentType        string                  `json:"contentType,omitempty"`
	SortMode           string                  `json:"sortMode"`
	Filters            []ContextFilter         `json:"filters,omitempty"`
	FilterHash         string                  `json:"filterHash"`
	Locale             string                  `json:"locale"`
	CountryOrRegion    string                  `json:"countryOrRegion,omitempty"`
	Currency           string                  `json:"currency,omitempty"`
	PageSizeOrTopK     int                     `json:"pageSizeOrTopK"`
	CapturedAt         string                  `json:"capturedAt"`
	CaptureWindowStart string                  `json:"captureWindowStart,omitempty"`
	CaptureWindowEnd   string                  `json:"captureWindowEnd,omitempty"`
	ContextLabel       string                  `json:"contextLabel"`
	ContextVersion     string                  `json:"contextVersion"`
}

type SurfaceSnapshotItem struct {
	ID                   string  `json:"id"`
	SnapshotID           string  `json:"snapshotId"`
	Rank                 int     `json:"rank"`
	ExternalItemID       string  `json:"externalItemId,omitempty"`
	CanonicalIdentityKey string  `json:"canonicalIdentityKey"`
	SourceURL            string  `json:"sourceUrl"`
	Title                string  `json:"title"`
	AuthorPublicName     string  `json:"authorPublicName,omitempty"`
	SourceCategory       string  `json:"sourceCategory,omitempty"`
	NormalizedCatalogID  string  `json:"normalizedCatalogId,omitempty"`
	ProductTypeID        string  `json:"productTypeId,omitempty"`
	UseCaseID            string  `json:"useCaseId,omitempty"`
	TopicOrStyleID       string  `json:"topicOrStyleId,omitempty"`
	TaxonomyConfidence   float64 `json:"taxonomyConfidence"`
	IdentityConfidence   float64 `json:"identityConfidence"`
	FirstReleaseAt       string  `json:"firstReleaseAt,omitempty"`
	FirstDetectedAt      string  `json:"firstDetectedAt,omitempty"`
}

type ObservationContextInput struct {
	Platform        ObservationPlatform     `json:"platform"`
	Experience      ObservationExperience   `json:"experience"`
	AccessState     ObservationAccessState  `json:"accessState"`
	SourceMethod    ObservationSourceMethod `json:"sourceMethod"`
	SourceSite      string                  `json:"sourceSite"`
	CatalogPath     string                  `json:"catalogPath"`
	ContentType     string                  `json:"contentType,omitempty"`
	SortMode        string                  `json:"sortMode"`
	Filters         []ContextFilter         `json:"filters,omitempty"`
	Locale          string                  `json:"locale"`
	CountryOrRegion string                  `json:"countryOrRegion,omitempty"`
	Currency        string                  `json:"currency,omitempty"`
	PageSizeOrTopK  int                     `json:"pageSizeOrTopK"`
	ContextLabel    string                  `json:"contextLabel"`
	ContextVersion  string                  `json:"contextVersion,omitempty"`
}

type SurfaceCaptureItem struct {
	Rank                int     `json:"rank"`
	ExternalItemID      string  `json:"externalItemId,omitempty"`
	SourceURL           string  `json:"sourceUrl"`
	Title               string  `json:"title"`
	AuthorPublicName    string  `json:"authorPublicName,omitempty"`
	SourceCategory      string  `json:"sourceCategory,omitempty"`
	NormalizedCatalogID string  `json:"normalizedCatalogId,omitempty"`
	ProductTypeID       string  `json:"productTypeId,omitempty"`
	UseCaseID           string  `json:"useCaseId,omitempty"`
	TopicOrStyleID      string  `json:"topicOrStyleId,omitempty"`
	TaxonomyConfidence  float64 `json:"taxonomyConfidence,omitempty"`
	FirstReleaseAt      string  `json:"firstReleaseAt,omitempty"`
	FirstDetectedAt     string  `json:"firstDetectedAt,omitempty"`
}

type SurfaceCapturePayload struct {
	Context           ObservationContextInput `json:"context"`
	PageURL           string                  `json:"pageUrl"`
	TopKRequested     int                     `json:"topKRequested"`
	CaptureStatus     string                  `json:"captureStatus"`
	CaptureDurationMs int64                   `json:"captureDurationMs,omitempty"`
	ExtractorVersion  string                  `json:"extractorVersion"`
	Items             []SurfaceCaptureItem    `json:"items"`
	RawHTML           string                  `json:"rawHtml,omitempty"`
}

type SurfaceSnapshot struct {
	ID                string           `json:"id"`
	ContextID         string           `json:"contextId"`
	CaptureBatchID    string           `json:"captureBatchId"`
	CatalogPath       string           `json:"catalogPath"`
	SortMode          string           `json:"sortMode"`
	FilterHash        string           `json:"filterHash"`
	TopKRequested     int              `json:"topKRequested"`
	TopKObserved      int              `json:"topKObserved"`
	CapturedAt        string           `json:"capturedAt"`
	CaptureDurationMs int64            `json:"captureDurationMs,omitempty"`
	CaptureStatus     string           `json:"captureStatus"`
	SourceReliability float64          `json:"sourceReliability"`
	Coverage          float64          `json:"coverage"`
	Confidence        float64          `json:"confidence"`
	DataQualityScore  float64          `json:"dataQualityScore"`
	DataQualityGrade  DataQualityGrade `json:"dataQualityGrade"`
	ModelVersion      string           `json:"modelVersion"`
	ItemCount         int              `json:"itemCount"`
}

type CaptureBatch struct {
	ID                   string   `json:"id"`
	Label                string   `json:"label"`
	CreatedAt            string   `json:"createdAt"`
	CompletedAt          string   `json:"completedAt,omitempty"`
	SnapshotIDs          []string `json:"snapshotIds"`
	ContextTypes         []string `json:"contextTypes"`
	PairToleranceMinutes int      `json:"pairToleranceMinutes"`
	CapturePolicyVersion string   `json:"capturePolicyVersion"`
	Status               string   `json:"status"`
}

type ComparabilityResult struct {
	Comparable   bool     `json:"comparable"`
	CommonTopK   int      `json:"commonTopK"`
	TruncatedA   bool     `json:"truncatedA"`
	TruncatedB   bool     `json:"truncatedB"`
	ReasonCodes  []string `json:"reasonCodes,omitempty"`
	ModelVersion string   `json:"modelVersion"`
}

type SnapshotPair struct {
	ID                 string   `json:"id"`
	CaptureBatchID     string   `json:"captureBatchId"`
	SnapshotAID        string   `json:"snapshotAId"`
	SnapshotBID        string   `json:"snapshotBId"`
	ContextAID         string   `json:"contextAId"`
	ContextBID         string   `json:"contextBId"`
	Comparable         bool     `json:"comparable"`
	CommonTopK         int      `json:"commonTopK"`
	CaptureDeltaMs     int64    `json:"captureDeltaMs"`
	ReasonCodes        []string `json:"reasonCodes,omitempty"`
	ComparabilityModel string   `json:"comparabilityModel"`
	CreatedAt          string   `json:"createdAt"`
}

type PairMetricSnapshot struct {
	ID                      string           `json:"id"`
	PairID                  string           `json:"pairId"`
	SnapshotAID             string           `json:"snapshotAId"`
	SnapshotBID             string           `json:"snapshotBId"`
	CommonTopK              int              `json:"commonTopK"`
	TopKOverlap             float64          `json:"topKOverlap"`
	RankBiasedOverlap       float64          `json:"rankBiasedOverlap"`
	SharedRankAgreement     float64          `json:"sharedRankAgreement"`
	SharedItemCount         int              `json:"sharedItemCount"`
	ProductTypeSimilarity   float64          `json:"productTypeSimilarity"`
	UseCaseSimilarity       float64          `json:"useCaseSimilarity"`
	CatalogSimilarity       float64          `json:"catalogSimilarity"`
	AuthorBreadthSimilarity float64          `json:"authorBreadthSimilarity"`
	ItemConsensus           float64          `json:"itemConsensus"`
	ConceptConsensus        float64          `json:"conceptConsensus"`
	OverallConsensus        float64          `json:"overallConsensus"`
	MissingComponents       []string         `json:"missingComponents,omitempty"`
	Coverage                float64          `json:"coverage"`
	Confidence              float64          `json:"confidence"`
	DataQualityScore        float64          `json:"dataQualityScore"`
	DataQualityGrade        DataQualityGrade `json:"dataQualityGrade"`
	EvidenceStage           string           `json:"evidenceStage"`
	EstablishedTrend        bool             `json:"establishedTrend"`
	ProvenanceID            string           `json:"provenanceId"`
	ModelVersions           []string         `json:"modelVersions"`
	ReasonCodes             []string         `json:"reasonCodes,omitempty"`
	GeneratedAt             string           `json:"generatedAt"`
}

type MarketAmbiguitySnapshot struct {
	ID           string  `json:"id"`
	PairID       string  `json:"pairId,omitempty"`
	ConsensusID  string  `json:"consensusId,omitempty"`
	Score        float64 `json:"score"`
	Label        string  `json:"label"`
	ProvenanceID string  `json:"provenanceId"`
	ModelVersion string  `json:"modelVersion"`
	GeneratedAt  string  `json:"generatedAt"`
}

type MultiContextConsensusSnapshot struct {
	ID                      string           `json:"id"`
	CaptureBatchID          string           `json:"captureBatchId,omitempty"`
	EntityType              string           `json:"entityType"`
	EntityID                string           `json:"entityId"`
	Label                   string           `json:"label"`
	Score                   float64          `json:"score"`
	ContextPresenceRate     float64          `json:"contextPresenceRate"`
	ContextBreadth          float64          `json:"contextBreadth"`
	CrossTimePersistence    float64          `json:"crossTimePersistence"`
	RankShareStrength       float64          `json:"rankShareStrength"`
	IndependentItemBreadth  float64          `json:"independentItemBreadth"`
	EvidenceQuality         float64          `json:"evidenceQuality"`
	ContextTypes            []string         `json:"contextTypes"`
	EligibleSnapshotIDs     []string         `json:"eligibleSnapshotIds"`
	EligibleSnapshots       int              `json:"eligibleSnapshots"`
	ComparableBatchCount    int              `json:"comparableBatchCount"`
	UnresolvedTaxonomyShare float64          `json:"unresolvedTaxonomyShare"`
	SignalState             string           `json:"signalState"`
	EvidenceStage           string           `json:"evidenceStage"`
	Coverage                float64          `json:"coverage"`
	Confidence              float64          `json:"confidence"`
	DataQualityScore        float64          `json:"dataQualityScore"`
	DataQualityGrade        DataQualityGrade `json:"dataQualityGrade"`
	ProvenanceID            string           `json:"provenanceId"`
	ModelVersion            string           `json:"modelVersion"`
	ReasonCodes             []string         `json:"reasonCodes,omitempty"`
	GeneratedAt             string           `json:"generatedAt"`
}

type SelectionProbabilitySnapshot struct {
	ID                   string           `json:"id"`
	EntityType           string           `json:"entityType"`
	EntityID             string           `json:"entityId"`
	Label                string           `json:"label"`
	Score                float64          `json:"score"`
	SelectedCount        int              `json:"selectedCount"`
	EligibleCount        int              `json:"eligibleCount"`
	SelectedWeight       float64          `json:"selectedWeight"`
	EligibleWeight       float64          `json:"eligibleWeight"`
	EligibleSnapshotIDs  []string         `json:"eligibleSnapshotIds"`
	ContextTypes         []string         `json:"contextTypes"`
	TopK                 int              `json:"topK"`
	MaterialityThreshold float64          `json:"materialityThreshold,omitempty"`
	WindowStart          string           `json:"windowStart"`
	WindowEnd            string           `json:"windowEnd"`
	Coverage             float64          `json:"coverage"`
	Confidence           float64          `json:"confidence"`
	DataQualityScore     float64          `json:"dataQualityScore"`
	DataQualityGrade     DataQualityGrade `json:"dataQualityGrade"`
	ProvenanceID         string           `json:"provenanceId"`
	ModelVersion         string           `json:"modelVersion"`
	GeneratedAt          string           `json:"generatedAt"`
}

type RankingVolatilitySnapshot struct {
	ID                      string   `json:"id"`
	EntityType              string   `json:"entityType"`
	EntityID                string   `json:"entityId"`
	ContextKey              string   `json:"contextKey,omitempty"`
	Score                   float64  `json:"score"`
	Label                   string   `json:"label"`
	RankVariance            float64  `json:"rankVariance,omitempty"`
	AbsenceRate             float64  `json:"absenceRate,omitempty"`
	MedianAbsoluteDeviation float64  `json:"medianAbsoluteDeviation,omitempty"`
	RBOPersistence          float64  `json:"rboPersistence,omitempty"`
	ConsecutivePersistence  float64  `json:"consecutivePersistence,omitempty"`
	EligibleSnapshotIDs     []string `json:"eligibleSnapshotIds"`
	ModelVersion            string   `json:"modelVersion"`
	GeneratedAt             string   `json:"generatedAt"`
}

type ContextHealthSnapshot struct {
	ID                 string           `json:"id"`
	ContextID          string           `json:"contextId"`
	CaptureBatchID     string           `json:"captureBatchId,omitempty"`
	Score              float64          `json:"score"`
	Coverage           float64          `json:"coverage"`
	Confidence         float64          `json:"confidence"`
	DataQualityScore   float64          `json:"dataQualityScore"`
	DataQualityGrade   DataQualityGrade `json:"dataQualityGrade"`
	TopKDepthScore     float64          `json:"topKDepthScore"`
	TimeAlignmentScore float64          `json:"timeAlignmentScore"`
	TaxonomyConfidence float64          `json:"taxonomyConfidence"`
	IdentityResolution float64          `json:"identityResolution"`
	ContextDiversity   float64          `json:"contextDiversity"`
	SourceReliability  float64          `json:"sourceReliability"`
	HistoricalDepth    float64          `json:"historicalDepth"`
	ReasonCodes        []string         `json:"reasonCodes,omitempty"`
	ModelVersion       string           `json:"modelVersion"`
	GeneratedAt        string           `json:"generatedAt"`
}

type ConsensusScoreComponent struct {
	Name            string  `json:"name"`
	Value           float64 `json:"value"`
	OriginalWeight  float64 `json:"originalWeight"`
	EffectiveWeight float64 `json:"effectiveWeight"`
	Contribution    float64 `json:"contribution"`
	Available       bool    `json:"available"`
}

type ConsensusScoreProvenance struct {
	ID                string                    `json:"id"`
	ScoreType         string                    `json:"scoreType"`
	EntityType        string                    `json:"entityType"`
	EntityID          string                    `json:"entityId"`
	PairID            string                    `json:"pairId,omitempty"`
	SnapshotIDs       []string                  `json:"snapshotIds"`
	ContextIDs        []string                  `json:"contextIds"`
	FinalScore        float64                   `json:"finalScore"`
	Components        []ConsensusScoreComponent `json:"components"`
	MissingComponents []string                  `json:"missingComponents,omitempty"`
	FallbackRules     []string                  `json:"fallbackRules,omitempty"`
	ModelVersions     []string                  `json:"modelVersions"`
	TopK              int                       `json:"topK,omitempty"`
	WindowStart       string                    `json:"windowStart,omitempty"`
	WindowEnd         string                    `json:"windowEnd,omitempty"`
	Coverage          float64                   `json:"coverage"`
	Confidence        float64                   `json:"confidence"`
	DataQualityScore  float64                   `json:"dataQualityScore"`
	DataQualityGrade  DataQualityGrade          `json:"dataQualityGrade"`
	ReasonCodes       []string                  `json:"reasonCodes,omitempty"`
	GeneratedAt       string                    `json:"generatedAt"`
}

type CaptureImportAudit struct {
	ID                string   `json:"id"`
	CaptureBatchID    string   `json:"captureBatchId"`
	ContextID         string   `json:"contextId,omitempty"`
	SnapshotID        string   `json:"snapshotId,omitempty"`
	SourceMethod      string   `json:"sourceMethod"`
	PageURL           string   `json:"pageUrl"`
	ExtractorVersion  string   `json:"extractorVersion,omitempty"`
	ImportedAt        string   `json:"importedAt"`
	Accepted          bool     `json:"accepted"`
	ItemCount         int      `json:"itemCount"`
	RejectedItemCount int      `json:"rejectedItemCount"`
	ReasonCodes       []string `json:"reasonCodes,omitempty"`
}

type ContextMatrixCell struct {
	ContextType string   `json:"contextType"`
	Available   bool     `json:"available"`
	Strength    float64  `json:"strength,omitempty"`
	SnapshotIDs []string `json:"snapshotIds,omitempty"`
}

type ContextMatrixRow struct {
	EntityType           string              `json:"entityType"`
	EntityID             string              `json:"entityId"`
	Label                string              `json:"label"`
	Cells                []ContextMatrixCell `json:"cells"`
	Consensus            float64             `json:"consensus"`
	Ambiguity            float64             `json:"ambiguity"`
	Volatility           float64             `json:"volatility"`
	SelectionProbability float64             `json:"selectionProbability"`
	SignalState          string              `json:"signalState"`
	DataQualityGrade     DataQualityGrade    `json:"dataQualityGrade"`
	ProvenanceID         string              `json:"provenanceId"`
}

type PairComparisonView struct {
	Pair        SnapshotPair             `json:"pair"`
	ContextA    ObservationContext       `json:"contextA"`
	ContextB    ObservationContext       `json:"contextB"`
	SnapshotA   SurfaceSnapshot          `json:"snapshotA"`
	SnapshotB   SurfaceSnapshot          `json:"snapshotB"`
	PairMetrics PairMetricSnapshot       `json:"pairMetrics"`
	Ambiguity   MarketAmbiguitySnapshot  `json:"ambiguity"`
	SharedItems []SurfaceSnapshotItem    `json:"sharedItems"`
	UniqueA     []SurfaceSnapshotItem    `json:"uniqueA"`
	UniqueB     []SurfaceSnapshotItem    `json:"uniqueB"`
	Provenance  ConsensusScoreProvenance `json:"provenance"`
}

type MarketConsensusView struct {
	ContextHealth     []ContextHealthSnapshot         `json:"contextHealth"`
	LatestPairs       []SnapshotPair                  `json:"latestPairs"`
	PairMetrics       []PairMetricSnapshot            `json:"pairMetrics"`
	Ambiguities       []MarketAmbiguitySnapshot       `json:"ambiguities"`
	ConsensusSignals  []MultiContextConsensusSnapshot `json:"consensusSignals"`
	Selection         []SelectionProbabilitySnapshot  `json:"selectionProbability"`
	Volatility        []RankingVolatilitySnapshot     `json:"volatility"`
	Matrix            []ContextMatrixRow              `json:"matrix"`
	EvidenceStage     string                          `json:"evidenceStage"`
	ComparableBatches int                             `json:"comparableBatches"`
}

type SurfaceSnapshotView struct {
	Context        ObservationContext    `json:"context"`
	CaptureBatchID string                `json:"captureBatchId"`
	Snapshot       SurfaceSnapshot       `json:"snapshot"`
	Items          []SurfaceSnapshotItem `json:"items"`
	Audit          CaptureImportAudit    `json:"audit"`
}

type ConsensusRefreshRequest struct {
	CaptureBatchID string   `json:"captureBatchId,omitempty"`
	CatalogPath    string   `json:"catalogPath,omitempty"`
	ContentType    string   `json:"contentType,omitempty"`
	EntityTypes    []string `json:"entityTypes,omitempty"`
	From           string   `json:"from,omitempty"`
	To             string   `json:"to,omitempty"`
}

type ConsensusDashboardFilter struct {
	CatalogPath string
	ContentType string
	EntityType  string
	SignalState string
	From        string
	To          string
	Limit       int
}

type ContextMatrixFilter struct {
	CatalogPath string
	ContentType string
	EntityType  string
	From        string
	To          string
	Limit       int
}

type ObservationContextFilter struct {
	ID, ContextKey, Experience, AccessState, SourceMethod, CatalogPath, From, To string
	Limit                                                                        int
}
type SurfaceSnapshotFilter struct {
	ID, ContextID, ContextKey, CaptureBatchID, CatalogPath, SortMode, From, To string
	Limit                                                                      int
}
type SurfaceSnapshotItemFilter struct {
	ID, SnapshotID, CanonicalIdentityKey, ProductTypeID, UseCaseID, CatalogID string
	Limit                                                                     int
}
type CaptureBatchFilter struct {
	ID, Status, From, To string
	Limit                int
}
type SnapshotPairFilter struct {
	ID, CaptureBatchID, SnapshotID, ContextID string
	Comparable                                *bool
	From, To                                  string
	Limit                                     int
}
type PairMetricFilter struct {
	ID, PairID, SnapshotID, From, To string
	Limit                            int
}
type MultiContextConsensusFilter struct {
	ID, CaptureBatchID, EntityType, EntityID, SignalState, From, To string
	Limit                                                           int
}
type MarketAmbiguityFilter struct {
	ID, PairID, ConsensusID, From, To string
	Limit                             int
}
type SelectionProbabilityFilter struct {
	ID, EntityType, EntityID, From, To string
	Limit                              int
}
type RankingVolatilityFilter struct {
	ID, EntityType, EntityID, ContextKey, From, To string
	Limit                                          int
}
type ContextHealthFilter struct {
	ID, ContextID, CaptureBatchID, From, To string
	Limit                                   int
}
type ConsensusScoreProvenanceFilter struct {
	ID, PairID, ScoreType, EntityType, EntityID, From, To string
	Limit                                                 int
}
type CaptureImportAuditFilter struct {
	ID, CaptureBatchID, ContextID, SnapshotID, SourceMethod, From, To string
	Accepted                                                          *bool
	Limit                                                             int
}
