package domain

type CatalogLevel string

const (
	CatalogLevelContentType  CatalogLevel = "content_type"
	CatalogLevelCatalog      CatalogLevel = "catalog"
	CatalogLevelSubcatalog   CatalogLevel = "subcatalog"
	CatalogLevelTheme        CatalogLevel = "theme"
	CatalogLevelNiche        CatalogLevel = "niche"
	CatalogLevelUseCase      CatalogLevel = "use_case"
	CatalogLevelStyleCluster CatalogLevel = "style_cluster"
)

type CatalogNode struct {
	ID                  string          `json:"id"`
	Platform            string          `json:"platform"`
	ContentType         string          `json:"contentType"`
	ParentID            string          `json:"parentId,omitempty"`
	Name                string          `json:"name"`
	CanonicalKey        string          `json:"canonicalKey"`
	Level               CatalogLevel    `json:"level"`
	FirstSeenAt         string          `json:"firstSeenAt"`
	LastSeenAt          string          `json:"lastSeenAt"`
	Origin              CatalogOrigin   `json:"origin,omitempty"`
	AnalyticalStatus    IntegrityStatus `json:"analyticalStatus,omitempty"`
	ExcludedFromRanking bool            `json:"excludedFromRanking,omitempty"`
}

type CatalogPathInput struct {
	Platform      string        `json:"platform"`
	ContentType   string        `json:"contentType"`
	Catalog       string        `json:"catalog,omitempty"`
	Subcatalog    string        `json:"subcatalog,omitempty"`
	Theme         string        `json:"theme,omitempty"`
	Niche         string        `json:"niche,omitempty"`
	UseCase       string        `json:"useCase,omitempty"`
	StyleCluster  string        `json:"styleCluster,omitempty"`
	Origin        CatalogOrigin `json:"origin,omitempty"`
	SourceSurface MarketSurface `json:"sourceSurface,omitempty"`
}

type ProductEntity struct {
	ID                 string `json:"id"`
	SourceType         string `json:"sourceType"`
	ExternalItemID     string `json:"externalItemId"`
	CanonicalCatalogID string `json:"canonicalCatalogId"`
	FirstSeenAt        string `json:"firstSeenAt"`
	LastSeenAt         string `json:"lastSeenAt"`
	Status             string `json:"status"`
}

type ReleasePrecision string

const (
	ReleasePrecisionDate     ReleasePrecision = "date"
	ReleasePrecisionDateTime ReleasePrecision = "datetime"
)

type ReleaseConflictStatus string

const (
	ReleaseConflictPending  ReleaseConflictStatus = "pending"
	ReleaseConflictResolved ReleaseConflictStatus = "resolved"
)

type ProductReleaseRecord struct {
	ID          string           `json:"id"`
	ProductID   string           `json:"productId"`
	ReleasedAt  string           `json:"releasedAt"`
	Precision   ReleasePrecision `json:"precision"`
	SourceType  string           `json:"sourceType"`
	SourceField string           `json:"sourceField"`
	SourceURL   string           `json:"sourceUrl,omitempty"`
	VerifiedAt  string           `json:"verifiedAt"`
}

type ProductReleaseConflict struct {
	ID                   string                `json:"id"`
	ProductID            string                `json:"productId"`
	ReleaseRecordID      string                `json:"releaseRecordId"`
	ExistingReleasedAt   string                `json:"existingReleasedAt"`
	CandidateReleasedAt  string                `json:"candidateReleasedAt"`
	CandidatePrecision   ReleasePrecision      `json:"candidatePrecision"`
	CandidateSourceType  string                `json:"candidateSourceType"`
	CandidateSourceField string                `json:"candidateSourceField"`
	DetectedAt           string                `json:"detectedAt"`
	Status               ReleaseConflictStatus `json:"status"`
}

type TrendEventType string

const (
	TrendEventEntered   TrendEventType = "trend_entered"
	TrendEventContinued TrendEventType = "trend_continued"
	TrendEventExited    TrendEventType = "trend_exited"
	TrendEventReentered TrendEventType = "trend_reentered"
)

type ProductTrendEvent struct {
	ID               string          `json:"id"`
	ProductID        string          `json:"productId"`
	RunID            string          `json:"runId"`
	PriorRunID       string          `json:"priorRunId,omitempty"`
	WindowDays       int             `json:"windowDays"`
	EventType        TrendEventType  `json:"eventType"`
	Active           bool            `json:"active"`
	TrendScore       float64         `json:"trendScore,omitempty"`
	OpportunityScore float64         `json:"opportunityScore,omitempty"`
	ExposureScore    float64         `json:"exposureScore,omitempty"`
	Direction        MarketDirection `json:"direction,omitempty"`
	OccurredAt       string          `json:"occurredAt"`
	ModelVersion     string          `json:"modelVersion,omitempty"`
}

type ProductTrendEventFilter struct {
	ProductID  string
	RunID      string
	WindowDays int
}

type LiveProductMetadata struct {
	ProductID         string `json:"productId"`
	AuthorID          string `json:"authorId,omitempty"`
	SourceType        string `json:"sourceType"`
	Title             string `json:"title"`
	AuthorDisplayName string `json:"authorDisplayName,omitempty"`
	SourceURL         string `json:"sourceUrl,omitempty"`
	PreviewRef        string `json:"previewRef,omitempty"`
	CategoryText      string `json:"categoryText,omitempty"`
	FetchedAt         string `json:"fetchedAt"`
	ExpiresAt         string `json:"expiresAt,omitempty"`
}

type AuthorEntity struct {
	ID                string `json:"id"`
	SourceType        string `json:"sourceType"`
	ExternalAuthorKey string `json:"externalAuthorKey"`
	DisplayName       string `json:"displayName"`
	FirstSeenAt       string `json:"firstSeenAt"`
	LastSeenAt        string `json:"lastSeenAt"`
	MetadataExpiresAt string `json:"metadataExpiresAt,omitempty"`
}

type ResearchQuery struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Platform       string            `json:"platform"`
	SourceType     string            `json:"sourceType"`
	QueryText      string            `json:"queryText"`
	CatalogScopeID string            `json:"catalogScopeId"`
	Filters        map[string]string `json:"filters,omitempty"`
	Purpose        string            `json:"purpose"`
	CreatedAt      string            `json:"createdAt"`
	Enabled        bool              `json:"enabled"`
}

type ResearchSessionStatus string

const (
	ResearchSessionRunning   ResearchSessionStatus = "running"
	ResearchSessionCompleted ResearchSessionStatus = "completed"
	ResearchSessionPartial   ResearchSessionStatus = "partial"
	ResearchSessionFailed    ResearchSessionStatus = "failed"
	ResearchSessionCancelled ResearchSessionStatus = "cancelled"
)

type ResearchSession struct {
	ID                    string                `json:"id"`
	StartedAt             string                `json:"startedAt"`
	CompletedAt           string                `json:"completedAt,omitempty"`
	SourceType            string                `json:"sourceType"`
	Scope                 string                `json:"scope"`
	RequestBudget         int                   `json:"requestBudget"`
	RequestsUsed          int                   `json:"requestsUsed"`
	QueryIDs              []string              `json:"queryIds"`
	CompletedQueryIDs     []string              `json:"completedQueryIds"`
	QueriesPlanned        int                   `json:"queriesPlanned"`
	QueriesCompleted      int                   `json:"queriesCompleted"`
	Status                ResearchSessionStatus `json:"status"`
	CoverageEstimate      float64               `json:"coverageEstimate"`
	PagesPlanned          int                   `json:"pagesPlanned,omitempty"`
	PagesCompleted        int                   `json:"pagesCompleted,omitempty"`
	ObservationsCollected int                   `json:"observationsCollected,omitempty"`
	ProductsObserved      int                   `json:"productsObserved,omitempty"`
	AuthorsObserved       int                   `json:"authorsObserved,omitempty"`
	LastProgressAt        string                `json:"lastProgressAt,omitempty"`
	ScannerVersion        string                `json:"scannerVersion,omitempty"`
	MarketMapRunID        string                `json:"marketMapRunId,omitempty"`
	Errors                []string              `json:"errors,omitempty"`
}

type ProductObservation struct {
	ID                     string           `json:"id"`
	SessionID              string           `json:"sessionId"`
	ProductID              string           `json:"productId"`
	AuthorID               string           `json:"authorId,omitempty"`
	QueryID                string           `json:"queryId"`
	CatalogID              string           `json:"catalogId"`
	SurfaceType            MarketSurface    `json:"surfaceType"`
	Position               int              `json:"position"`
	Page                   int              `json:"page"`
	ObservedAt             string           `json:"observedAt"`
	SourceType             string           `json:"sourceType"`
	ObservationReliability float64          `json:"observationReliability"`
	MarketMapRunID         string           `json:"marketMapRunId,omitempty"`
	ReleasedAt             string           `json:"releasedAt,omitempty"`
	ReleasePrecision       ReleasePrecision `json:"releasePrecision,omitempty"`
	ReleaseSourceField     string           `json:"releaseSourceField,omitempty"`
}

type SourceAdapterPolicy struct {
	SourceType              string `json:"sourceType"`
	CollectionMode          string `json:"collectionMode"`
	RawPayloadRetention     bool   `json:"rawPayloadRetention"`
	MetadataTTLSeconds      int64  `json:"metadataTtlSeconds"`
	HistoricalFactRetention string `json:"historicalFactRetention"`
	MaxRequestBudget        int    `json:"maxRequestBudget"`
	AttributionRequirement  string `json:"attributionRequirement,omitempty"`
}

type ObservedProductInput struct {
	SessionID              string           `json:"sessionId"`
	QueryID                string           `json:"queryId"`
	CatalogID              string           `json:"catalogId"`
	SourceType             string           `json:"sourceType"`
	ExternalItemID         string           `json:"externalItemId"`
	Title                  string           `json:"title"`
	ExternalAuthorKey      string           `json:"externalAuthorKey,omitempty"`
	AuthorDisplayName      string           `json:"authorDisplayName,omitempty"`
	SourceURL              string           `json:"sourceUrl,omitempty"`
	PreviewRef             string           `json:"previewRef,omitempty"`
	CategoryText           string           `json:"categoryText,omitempty"`
	SurfaceType            MarketSurface    `json:"surfaceType"`
	Position               int              `json:"position"`
	Page                   int              `json:"page"`
	ObservedAt             string           `json:"observedAt"`
	ObservationReliability float64          `json:"observationReliability"`
	MarketMapRunID         string           `json:"marketMapRunId,omitempty"`
	ReleasedAt             string           `json:"releasedAt,omitempty"`
	ReleasePrecision       ReleasePrecision `json:"releasePrecision,omitempty"`
	ReleaseSourceField     string           `json:"releaseSourceField,omitempty"`
}

type ObservationFilter struct {
	SessionID      string
	ProductID      string
	AuthorID       string
	QueryID        string
	CatalogID      string
	MarketMapRunID string
}

// MarketScanRequest contains only non-secret scan parameters. Credential resolution belongs to the Go service boundary.
type MarketScanRequest struct {
	Catalog          CatalogPathInput `json:"catalog"`
	Keywords         []string         `json:"keywords"`
	Site             string           `json:"site"`
	Category         string           `json:"category,omitempty"`
	SortBy           string           `json:"sortBy,omitempty"`
	MaxPages         int              `json:"maxPages"`
	PageSize         int              `json:"pageSize"`
	RequestBudget    int              `json:"requestBudget"`
	AutoBuildRanking bool             `json:"autoBuildRanking,omitempty"`
}

type MarketScanQueryResult struct {
	QueryID        string `json:"queryId"`
	QueryText      string `json:"queryText"`
	PagesCompleted int    `json:"pagesCompleted"`
	ItemsObserved  int    `json:"itemsObserved"`
	UniqueProducts int    `json:"uniqueProducts"`
	UniqueAuthors  int    `json:"uniqueAuthors"`
	TotalHits      int    `json:"totalHits"`
	TotalHitsExact bool   `json:"totalHitsExact"`
	StoppedReason  string `json:"stoppedReason"`
}

type MarketScanResult struct {
	Session         ResearchSession         `json:"session"`
	Catalog         CatalogNode             `json:"catalog"`
	QueryResults    []MarketScanQueryResult `json:"queryResults"`
	Observations    int                     `json:"observations"`
	Products        int                     `json:"products"`
	Authors         int                     `json:"authors"`
	SummaryCode     string                  `json:"summaryCode"`
	InsightCode     string                  `json:"insightCode"`
	InsightSeverity string                  `json:"insightSeverity"`
	RankingBuilt    bool                    `json:"rankingBuilt"`
	RankingMessage  string                  `json:"rankingMessage,omitempty"`
}
