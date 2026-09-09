package analyticsengine

type RankingWindowBucket uint8

const (
	RankingWindowOutside  RankingWindowBucket = 0
	RankingWindowCurrent  RankingWindowBucket = 1
	RankingWindowPrevious RankingWindowBucket = 2
)

type ProductRankingEntityV01 struct {
	ProductKey           uint32
	CatalogKey           uint32
	FirstSeenBucket      RankingWindowBucket
	ApplicableQueryKeys  []uint32
	SessionCoverages     []float64
	SegmentationFallback bool
}

type ProductRankingObservationV01 struct {
	ProductKey   uint32
	WindowBucket RankingWindowBucket
	QueryKey     uint32
	SurfaceCode  uint8
	Position     int32
	Reliability  float64
}

type ProductRankingV01Input struct {
	Products     []ProductRankingEntityV01
	Observations []ProductRankingObservationV01
}

type ProductRankingV01ResultRow struct {
	ProductKey               uint32
	CurrentObservationCount  uint32
	PreviousObservationCount uint32
	QueryAppearances         uint32
	ApplicableQueries        uint32
	SurfaceAppearances       uint32
	MedianPosition           float64
	PreviousMedianPosition   *float64
	RankVelocity             float64
	RankVelocityScore        *float64
	ExposureScore            float64
	FreshnessScore           float64
	CrossQueryStrength       float64
	RelativeStrength         float64
	DirectionCode            uint8
	ComparableHistory        bool
	Confidence               float64
	Coverage                 float64
	OpportunityScore         float64
	MissingMask              uint64
}

type ProductRankingV01Result struct {
	Rows []ProductRankingV01ResultRow
}

type CatalogRankingEntityV01 struct {
	CatalogKey               uint32
	PeerGroupKey             uint32
	ApplicableQueryCount     uint32
	CurrentCompletedQueries  uint32
	PreviousCompletedQueries uint32
	CurrentSessionCoverages  []float64
}

type CatalogRankingObservationV01 struct {
	CatalogKey   uint32
	ProductKey   uint32
	AuthorKey    uint32
	HasAuthor    bool
	QueryKey     uint32
	WindowBucket RankingWindowBucket
	Reliability  float64
}

type CatalogProductMembershipV01 struct {
	CatalogKey uint32
	ProductKey uint32
}

type CatalogProductFirstSeenV01 struct {
	ProductKey      uint32
	FirstSeenBucket RankingWindowBucket
}

type CatalogRankingV01Input struct {
	Catalogs       []CatalogRankingEntityV01
	Observations   []CatalogRankingObservationV01
	Memberships    []CatalogProductMembershipV01
	FirstSeen      []CatalogProductFirstSeenV01
	ProductResults []ProductRankingV01ResultRow
}

type CatalogRankingV01ResultRow struct {
	CatalogKey                uint32
	ObservedProducts          uint32
	ObservedAuthors           uint32
	NewProducts               uint32
	PreviousNewProducts       uint32
	RisingProducts            uint32
	NeutralProducts           uint32
	FallingProducts           uint32
	ComparableProducts        uint32
	MedianRankVelocity        float64
	ExposureBreadth           float64
	DemandMomentumPercent     float64
	DemandMomentumIndex       float64
	NewSupplyVelocityPercent  float64
	NewSupplyVelocityIndex    float64
	CompetitionAcceleration   float64
	CompetitionMomentumIndex  float64
	AuthorConcentration       float64
	AuthorAttributionCoverage float64
	FreshnessIndex            float64
	RelativeStrength          float64
	SupplyGap                 float64
	DirectionIndex            float64
	TrendScore                float64
	OpportunityScore          float64
	DirectionCode             uint8
	Confidence                float64
	Coverage                  float64
	MissingMask               uint64
}

type CatalogRankingV01Result struct {
	Rows []CatalogRankingV01ResultRow
}

type StructuralSegmentEvidenceV01 struct {
	SegmentKey       uint32
	ParentKey        uint32
	LevelCode        uint8
	ObservedProducts uint32
	DataQualityScore float64
	DataQualityGrade uint8
}

type StructuralIndexV01Input struct {
	Segments []StructuralSegmentEvidenceV01
}

type StructuralIndexV01ResultRow struct {
	SegmentKey          uint32
	ParentKey           uint32
	LevelCode           uint8
	CompositionIndex    float64
	VolumeWeightedValue float64
	EqualSectorValue    float64
	DivergenceValue     float64
	DivergenceStateCode uint8
	DirectionStageCode  uint8
	Coverage            float64
	Confidence          float64
	DataQualityScore    float64
	DataQualityGrade    uint8
	SampleSize          uint32
}

type StructuralIndexWeightV01 struct {
	SegmentKey uint32
	Weight     float64
}

type StructuralIndexWeightResultV01 struct {
	ParentKey     uint32
	ConfiguredCap float64
	EffectiveCap  float64
	FallbackMask  uint32
	Weights       []StructuralIndexWeightV01
}

type StructuralIndexV01Result struct {
	Rows          []StructuralIndexV01ResultRow
	WeightResults []StructuralIndexWeightResultV01
}
