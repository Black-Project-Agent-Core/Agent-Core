package domain

type ExplorerTarget string

const (
	ExplorerTargetCatalogs ExplorerTarget = "catalogs"
	ExplorerTargetProducts ExplorerTarget = "products"
	ExplorerTargetAuthors  ExplorerTarget = "authors"
	ExplorerTargetSessions ExplorerTarget = "sessions"
)

type WatchEntityType string

const (
	WatchEntityCatalog WatchEntityType = "catalog"
	WatchEntityProduct WatchEntityType = "product"
	WatchEntityAuthor  WatchEntityType = "author"
)

type CatalogExplorerFilter struct {
	Text                string
	ParentID            string
	Platform            string
	ContentType         string
	Level               CatalogLevel
	Direction           MarketDirection
	MinTrend            *float64
	MaxTrend            *float64
	MinOpportunity      *float64
	MaxOpportunity      *float64
	MinConfidence       *float64
	MinCoverage         *float64
	MinObservedProducts int
	WindowDays          int
	SortBy              string
	Desc                bool
	Limit               int
	Offset              int
}

type ProductExplorerFilter struct {
	Text                string
	CatalogID           string
	AuthorID            string
	Freshness           string
	Direction           MarketDirection
	MinExposure         *float64
	MaxExposure         *float64
	MinOpportunity      *float64
	MaxOpportunity      *float64
	MinConfidence       *float64
	MinCoverage         *float64
	MinObservations     int
	MinQueryAppearances int
	WindowDays          int
	SortBy              string
	Desc                bool
	Limit               int
	Offset              int
}

type AuthorExplorerFilter struct {
	Text                string
	CatalogID           string
	MinObservedProducts int
	MinCatalogCount     int
	MinObservationCount int
	SortBy              string
	Desc                bool
	Limit               int
	Offset              int
}

type SessionExplorerFilter struct {
	Text        string
	Status      ResearchSessionStatus
	SourceType  string
	CatalogID   string
	StartedFrom string
	StartedTo   string
	MinCoverage *float64
	SortBy      string
	Desc        bool
	Limit       int
	Offset      int
}

type CatalogExplorerRow struct {
	Catalog          CatalogNode      `json:"catalog"`
	ObservedProducts int              `json:"observedProducts"`
	ObservedAuthors  int              `json:"observedAuthors"`
	ResearchQueries  int              `json:"researchQueries"`
	ResearchSessions int              `json:"researchSessions"`
	Coverage         float64          `json:"coverage"`
	FirstObservedAt  string           `json:"firstObservedAt,omitempty"`
	LastObservedAt   string           `json:"lastObservedAt,omitempty"`
	Snapshot         *CatalogSnapshot `json:"snapshot,omitempty"`
}

type ProductExplorerRow struct {
	Product           ProductEntity        `json:"product"`
	Metadata          *LiveProductMetadata `json:"metadata,omitempty"`
	MetadataFreshness string               `json:"metadataFreshness"`
	Author            *AuthorEntity        `json:"author,omitempty"`
	ObservationCount  int                  `json:"observationCount"`
	QueryAppearances  int                  `json:"queryAppearances"`
	FirstObservedAt   string               `json:"firstObservedAt"`
	LastObservedAt    string               `json:"lastObservedAt"`
	Snapshot          *ProductSnapshot     `json:"snapshot,omitempty"`
}

type AuthorExplorerRow struct {
	Author           AuthorEntity `json:"author"`
	ObservedProducts int          `json:"observedProducts"`
	CatalogCount     int          `json:"catalogCount"`
	ObservationCount int          `json:"observationCount"`
}

type SessionExplorerRow struct {
	Session          ResearchSession `json:"session"`
	ObservedProducts int             `json:"observedProducts"`
	ObservedAuthors  int             `json:"observedAuthors"`
	ObservationRows  int             `json:"observationRows"`
}

type PagedCatalogExplorerRows struct {
	Items  []CatalogExplorerRow `json:"items"`
	Total  int                  `json:"total"`
	Limit  int                  `json:"limit"`
	Offset int                  `json:"offset"`
}

type PagedProductExplorerRows struct {
	Items  []ProductExplorerRow `json:"items"`
	Total  int                  `json:"total"`
	Limit  int                  `json:"limit"`
	Offset int                  `json:"offset"`
}

type PagedAuthorExplorerRows struct {
	Items  []AuthorExplorerRow `json:"items"`
	Total  int                 `json:"total"`
	Limit  int                 `json:"limit"`
	Offset int                 `json:"offset"`
}

type PagedSessionExplorerRows struct {
	Items  []SessionExplorerRow `json:"items"`
	Total  int                  `json:"total"`
	Limit  int                  `json:"limit"`
	Offset int                  `json:"offset"`
}

type SavedView struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Target    ExplorerTarget    `json:"target"`
	Filters   map[string]string `json:"filters"`
	CreatedAt string            `json:"createdAt"`
	UpdatedAt string            `json:"updatedAt"`
	Deleted   bool              `json:"deleted,omitempty"`
}

type WatchlistEntry struct {
	ID         string          `json:"id"`
	EntityType WatchEntityType `json:"entityType"`
	EntityID   string          `json:"entityId"`
	Label      string          `json:"label,omitempty"`
	Notes      string          `json:"notes,omitempty"`
	CreatedAt  string          `json:"createdAt"`
	UpdatedAt  string          `json:"updatedAt"`
	Deleted    bool            `json:"deleted,omitempty"`
}

type WatchlistResolvedRow struct {
	Entry           WatchlistEntry       `json:"entry"`
	Label           string               `json:"label"`
	Catalog         *CatalogNode         `json:"catalog,omitempty"`
	Product         *ProductEntity       `json:"product,omitempty"`
	Metadata        *LiveProductMetadata `json:"metadata,omitempty"`
	Author          *AuthorEntity        `json:"author,omitempty"`
	CatalogSnapshot *CatalogSnapshot     `json:"catalogSnapshot,omitempty"`
	ProductSnapshot *ProductSnapshot     `json:"productSnapshot,omitempty"`
}
