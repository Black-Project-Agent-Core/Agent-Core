package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"marketsignallab/internal/analytics"
	analyticsenginepkg "marketsignallab/internal/analyticsengine"
	envatoconn "marketsignallab/internal/connectors/envato"
	consensusengine "marketsignallab/internal/consensus"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/ingest"
	"marketsignallab/internal/repository"
	"marketsignallab/internal/sources"
	"marketsignallab/internal/storage"
	telemetrypkg "marketsignallab/internal/telemetry"
	"sort"
	"time"
)

type Service struct {
	store            *storage.Store
	universe         repository.UniverseRepository
	ranking          repository.RankingRepository
	explorer         repository.ExplorerRepository
	autopilot        repository.AutopilotRepository
	integrity        repository.IntegrityRepository
	consensus        repository.ConsensusRepository
	envato           *envatoconn.Client
	credentials      *credentialspkg.Manager
	policies         *sources.PolicyRegistry
	telemetry        *telemetrypkg.Recorder
	runManager       *AutopilotRunManager
	analyticsEngine  analyticsenginepkg.Engine
	analyticsRuntime *analyticsenginepkg.ProductionRuntime
}

func newServiceBaseWithCredentials(store *storage.Store, client *envatoconn.Client, runtime *analyticsenginepkg.ProductionRuntime, manager *credentialspkg.Manager) *Service {
	if client == nil {
		client = envatoconn.NewClient()
	}
	if runtime == nil {
		runtime = analyticsenginepkg.NewProductionRuntime(context.Background(), "", 2*time.Second)
	}
	if manager == nil {
		manager = credentialspkg.NewDefaultManager(store.Root(), credentialspkg.DefaultEnvName)
	}
	s := &Service{
		store: store, universe: store, ranking: store, explorer: store, autopilot: store,
		integrity: store, consensus: store, envato: client, credentials: manager, policies: sources.DefaultPolicyRegistry(),
		analyticsEngine: runtime.Engine(), analyticsRuntime: runtime,
	}
	s.telemetry = telemetrypkg.NewRecorder(store, time.Now)
	s.runManager = NewAutopilotRunManager(s)
	return s
}

func newServiceBase(store *storage.Store, client *envatoconn.Client, runtime *analyticsenginepkg.ProductionRuntime) *Service {
	return newServiceBaseWithCredentials(store, client, runtime, nil)
}

func newConfiguredService(store *storage.Store, client *envatoconn.Client) *Service {
	runtime := analyticsenginepkg.NewProductionRuntime(context.Background(), "", 2*time.Second)
	return newServiceBase(store, client, runtime)
}

func New(store *storage.Store) *Service {
	return newConfiguredService(store, envatoconn.NewClient())
}

func NewWithEnvatoClient(store *storage.Store, client *envatoconn.Client) *Service {
	return newConfiguredService(store, client)
}

// NewWithAnalyticsEngine is test/specialized injection only. Normal runtime
// construction must use New/NewWithEnvatoClient and the packaged Rust worker.
func NewWithAnalyticsEngine(store *storage.Store, engine analyticsenginepkg.Engine) *Service {
	runtime := analyticsenginepkg.NewProductionRuntimeWithEngine(engine)
	return newServiceBase(store, envatoconn.NewClient(), runtime)
}

// NewWithEnvatoClientAndAnalyticsEngine is intended for deterministic integration
// tests that need a fake Envato endpoint plus a fake analytics worker.
func NewWithEnvatoClientAndAnalyticsEngine(store *storage.Store, client *envatoconn.Client, engine analyticsenginepkg.Engine) *Service {
	runtime := analyticsenginepkg.NewProductionRuntimeWithEngine(engine)
	return newServiceBase(store, client, runtime)
}

// NewWithEnvatoClientAndAnalyticsEngineAndCredentials is test/specialized injection
// for deterministic Envato + analytics + credential lifecycle integration tests.
func NewWithEnvatoClientAndAnalyticsEngineAndCredentials(store *storage.Store, client *envatoconn.Client, engine analyticsenginepkg.Engine, manager *credentialspkg.Manager) *Service {
	runtime := analyticsenginepkg.NewProductionRuntimeWithEngine(engine)
	return newServiceBaseWithCredentials(store, client, runtime, manager)
}

func (s *Service) AnalyticsEngineHealth(ctx context.Context) analyticsenginepkg.Health {
	if s.analyticsRuntime == nil {
		return analyticsenginepkg.Health{Status: analyticsenginepkg.EngineUnavailable, Engine: "rust-production", Protocol: analyticsenginepkg.ProtocolV1, Message: analyticsenginepkg.ErrRuntimeUnavailable.Error()}
	}
	return s.analyticsRuntime.Health(ctx)
}

func (s *Service) AnalyticsDiagnostics(ctx context.Context) analyticsenginepkg.DiagnosticsSnapshot {
	return analyticsenginepkg.ProductionDiagnostics(ctx, s.analyticsRuntime)
}

func (s *Service) RequireAnalyticsRuntime(ctx context.Context) error {
	if s.analyticsRuntime == nil {
		return analyticsenginepkg.ErrRuntimeUnavailable
	}
	return s.analyticsRuntime.Ready(ctx)
}

func (s *Service) Close() error {
	if s.analyticsRuntime != nil {
		return s.analyticsRuntime.Close()
	}
	return nil
}

type AnalyzeRequest struct {
	IdentityID string                   `json:"identityId"`
	Features   domain.FeatureSet        `json:"features"`
	Confidence domain.ConfidenceContext `json:"confidence"`
}

func (s *Service) CreateIdentity(v domain.MarketIdentity) (domain.MarketIdentity, error) {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	if v.TargetPlatform == "" {
		v.TargetPlatform = "elements"
	}
	if v.CreatedAt == "" {
		v.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if v.Theme == "" || v.ProductType == "" || v.SubNiche == "" {
		return v, errors.New("theme, productType, and subNiche are required")
	}
	return v, s.store.SaveIdentity(v)
}
func (s *Service) ListIdentities() ([]domain.MarketIdentity, error) { return s.store.Identities() }

func (s *Service) buildAnalysis(req AnalyzeRequest) (domain.Analysis, error) {
	r, err := analytics.OpportunityV01(req.Features)
	if err != nil {
		return domain.Analysis{}, err
	}
	conf := analytics.ConfidenceV01(req.Confidence)
	warning := ""
	if req.Confidence.TargetPlatform == "elements" && !req.Confidence.DirectElementsEvidence {
		warning = "Proxy-only Elements analysis: Confidence is capped at 60 until direct Elements evidence is added."
	}
	return domain.Analysis{ID: domain.NewID(), IdentityID: req.IdentityID, AsOf: time.Now().UTC().Format("2006-01-02"), Opportunity: r.Score, Confidence: conf, Direction: "unknown", Features: req.Features, ModelVersion: r.ModelVersion, CoverageWeight: r.CoverageWeight, Missing: r.Missing, Warning: warning, Explanation: map[string]any{"modelKind": r.ModelKind, "contributions": r.Contributions, "effectiveWeights": r.EffectiveWeights}}, nil
}

func (s *Service) Analyze(req AnalyzeRequest) (domain.Analysis, error) {
	a, err := s.buildAnalysis(req)
	if err != nil {
		return domain.Analysis{}, err
	}
	if err := s.store.AppendAnalysis(a); err != nil {
		return domain.Analysis{}, err
	}
	return a, nil
}
func (s *Service) History(id string) ([]domain.Analysis, error)    { return s.store.Analyses(id) }
func (s *Service) Latest(id string) (domain.Analysis, bool, error) { return s.store.LatestAnalysis(id) }

func (s *Service) AddBenchmark(v domain.Benchmark) (domain.Benchmark, error) {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	if v.AsOf == "" {
		v.AsOf = time.Now().UTC().Format("2006-01-02")
	}
	if v.SourceLabel == "" {
		v.SourceLabel = "Envato Trends & Insights manual"
	}
	return v, s.store.AppendBenchmark(v)
}
func (s *Service) CompareLatest(id string) (domain.Comparison, error) {
	a, ok, err := s.store.LatestAnalysis(id)
	if err != nil {
		return domain.Comparison{}, err
	}
	if !ok {
		return domain.Comparison{}, errors.New("no analysis available")
	}
	b, ok, err := s.store.LatestBenchmark(id)
	if err != nil {
		return domain.Comparison{}, err
	}
	if !ok {
		return domain.Comparison{}, errors.New("no benchmark available")
	}
	c := analytics.Compare(a, b)
	if err := s.store.AppendComparison(c); err != nil {
		return domain.Comparison{}, err
	}
	return c, nil
}

type OverviewRow struct {
	Identity domain.MarketIdentity `json:"identity"`
	Analysis domain.Analysis       `json:"analysis"`
}

func (s *Service) Overview() ([]OverviewRow, error) {
	ids, err := s.store.Identities()
	if err != nil {
		return nil, err
	}
	out := []OverviewRow{}
	for _, id := range ids {
		a, ok, e := s.store.LatestAnalysis(id.ID)
		if e != nil {
			return nil, e
		}
		if ok {
			out = append(out, OverviewRow{Identity: id, Analysis: a})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Analysis.Opportunity > out[j].Analysis.Opportunity })
	return out, nil
}

type ExportBundle struct {
	ExportedAt                    string                                 `json:"exportedAt"`
	App                           string                                 `json:"app"`
	Version                       string                                 `json:"version"`
	Identities                    []domain.MarketIdentity                `json:"identities"`
	Analyses                      []domain.Analysis                      `json:"analyses"`
	Benchmarks                    []domain.Benchmark                     `json:"benchmarks"`
	Evidence                      []domain.EvidenceRecord                `json:"evidence"`
	Catalogs                      []domain.CatalogNode                   `json:"catalogs"`
	Products                      []domain.ProductEntity                 `json:"products"`
	ProductMetadata               []domain.LiveProductMetadata           `json:"productMetadata"`
	Authors                       []domain.AuthorEntity                  `json:"authors"`
	ResearchQueries               []domain.ResearchQuery                 `json:"researchQueries"`
	ResearchSessions              []domain.ResearchSession               `json:"researchSessions"`
	ProductObservations           []domain.ProductObservation            `json:"productObservations"`
	CatalogSnapshots              []domain.CatalogSnapshot               `json:"catalogSnapshots"`
	ProductSnapshots              []domain.ProductSnapshot               `json:"productSnapshots"`
	RankingModels                 []domain.ModelDefinition               `json:"rankingModels"`
	SourcePolicies                []domain.SourceAdapterPolicy           `json:"sourcePolicies"`
	SavedViews                    []domain.SavedView                     `json:"savedViews"`
	Watchlist                     []domain.WatchlistEntry                `json:"watchlist"`
	MarketMapPlans                []domain.MarketMapPlan                 `json:"marketMapPlans"`
	MarketMapRuns                 []domain.MarketMapRun                  `json:"marketMapRuns"`
	MarketSurfaceObservations     []domain.MarketSurfaceObservation      `json:"marketSurfaceObservations"`
	MarketDirections              []domain.MarketDirectionSnapshot       `json:"marketDirections"`
	ProductDirections             []domain.ProductDirectionCluster       `json:"productDirections"`
	ProductionInsights            []domain.ProductionInsight             `json:"productionInsights"`
	SaturationAlerts              []domain.SaturationAlert               `json:"saturationAlerts"`
	AdvancedResearchSeeds         []domain.AdvancedResearchSeed          `json:"advancedResearchSeeds"`
	ClassificationReviews         []domain.ClassificationReview          `json:"classificationReviews"`
	ProductReleases               []domain.ProductReleaseRecord          `json:"productReleases"`
	ProductReleaseConflicts       []domain.ProductReleaseConflict        `json:"productReleaseConflicts"`
	ProductTrendEvents            []domain.ProductTrendEvent             `json:"productTrendEvents"`
	MarketMapTargetResults        []domain.MarketMapTargetResult         `json:"marketMapTargetResults"`
	ObservationSegmentations      []domain.ObservationSegmentation       `json:"observationSegmentations"`
	SampleAudits                  []domain.SampleAudit                   `json:"sampleAudits"`
	DataQualityAssessments        []domain.DataQualityAssessment         `json:"dataQualityAssessments"`
	MarketIndexSnapshots          []domain.MarketIndexSnapshot           `json:"marketIndexSnapshots"`
	ScoreProvenance               []domain.ScoreProvenance               `json:"scoreProvenance"`
	LegacyClassificationReviews   []domain.LegacyClassificationReview    `json:"legacyClassificationReviews"`
	IntegrityModels               []domain.ModelDefinition               `json:"integrityModels"`
	ObservationContexts           []domain.ObservationContext            `json:"observationContexts"`
	SurfaceSnapshots              []domain.SurfaceSnapshot               `json:"surfaceSnapshots"`
	SurfaceSnapshotItems          []domain.SurfaceSnapshotItem           `json:"surfaceSnapshotItems"`
	CaptureBatches                []domain.CaptureBatch                  `json:"captureBatches"`
	SnapshotPairs                 []domain.SnapshotPair                  `json:"snapshotPairs"`
	PairMetrics                   []domain.PairMetricSnapshot            `json:"pairMetrics"`
	MarketConsensusSnapshots      []domain.MultiContextConsensusSnapshot `json:"marketConsensusSnapshots"`
	MarketAmbiguitySnapshots      []domain.MarketAmbiguitySnapshot       `json:"marketAmbiguitySnapshots"`
	SelectionProbabilitySnapshots []domain.SelectionProbabilitySnapshot  `json:"selectionProbabilitySnapshots"`
	RankingVolatilitySnapshots    []domain.RankingVolatilitySnapshot     `json:"rankingVolatilitySnapshots"`
	ContextHealthSnapshots        []domain.ContextHealthSnapshot         `json:"contextHealthSnapshots"`
	ConsensusScoreProvenance      []domain.ConsensusScoreProvenance      `json:"consensusScoreProvenance"`
	CaptureImportAudits           []domain.CaptureImportAudit            `json:"captureImportAudits"`
	ConsensusModels               []domain.ModelDefinition               `json:"consensusModels"`
	ScanTelemetryEvents           []domain.ScanTelemetryEvent            `json:"scanTelemetryEvents"`
	ScanRuntimeSummaries          []domain.ScanRuntimeSummary            `json:"scanRuntimeSummaries"`
}

func (s *Service) Export() (ExportBundle, error) {
	ids, err := s.store.Identities()
	if err != nil {
		return ExportBundle{}, err
	}
	catalogs, err := s.universe.CatalogNodes()
	if err != nil {
		return ExportBundle{}, err
	}
	products, err := s.universe.Products()
	if err != nil {
		return ExportBundle{}, err
	}
	authors, err := s.universe.Authors()
	if err != nil {
		return ExportBundle{}, err
	}
	queries, err := s.universe.ResearchQueries()
	if err != nil {
		return ExportBundle{}, err
	}
	sessions, err := s.universe.ResearchSessions()
	if err != nil {
		return ExportBundle{}, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	catalogSnapshots, err := s.ranking.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	productSnapshots, err := s.ranking.ProductSnapshots(domain.ProductSnapshotFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	savedViews, err := s.explorer.SavedViews()
	if err != nil {
		return ExportBundle{}, err
	}
	watchlist, err := s.explorer.WatchlistEntries()
	if err != nil {
		return ExportBundle{}, err
	}
	marketMapPlans, err := s.autopilot.MarketMapPlans()
	if err != nil {
		return ExportBundle{}, err
	}
	marketMapRuns, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return ExportBundle{}, err
	}
	marketSurfaceObservations, err := s.autopilot.MarketSurfaceObservations("")
	if err != nil {
		return ExportBundle{}, err
	}
	marketDirections, err := s.autopilot.MarketDirectionSnapshots("")
	if err != nil {
		return ExportBundle{}, err
	}
	productDirections, err := s.autopilot.ProductDirectionClusters("")
	if err != nil {
		return ExportBundle{}, err
	}
	productionInsights, err := s.autopilot.ProductionInsights("")
	if err != nil {
		return ExportBundle{}, err
	}
	saturationAlerts, err := s.autopilot.SaturationAlerts("")
	if err != nil {
		return ExportBundle{}, err
	}
	advancedResearchSeeds, err := s.autopilot.AdvancedResearchSeeds("")
	if err != nil {
		return ExportBundle{}, err
	}
	classificationReviews, err := s.autopilot.ClassificationReviews("")
	if err != nil {
		return ExportBundle{}, err
	}
	productReleases, err := s.universe.ProductReleases()
	if err != nil {
		return ExportBundle{}, err
	}
	productReleaseConflicts, err := s.universe.ProductReleaseConflicts("")
	if err != nil {
		return ExportBundle{}, err
	}
	productTrendEvents, err := s.universe.ProductTrendEvents(domain.ProductTrendEventFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	marketMapTargetResults, err := s.integrity.MarketMapTargetResults("")
	if err != nil {
		return ExportBundle{}, err
	}
	observationSegmentations, err := s.integrity.ObservationSegmentations(domain.ObservationSegmentationFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	sampleAudits, err := s.integrity.SampleAudits(domain.SampleAuditFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	dataQualityAssessments, err := s.integrity.DataQualityAssessments(domain.DataQualityFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	marketIndexSnapshots, err := s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	scoreProvenance, err := s.integrity.ScoreProvenances(domain.ScoreProvenanceFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	legacyClassificationReviews, err := s.integrity.LegacyClassificationReviews(domain.LegacyClassificationReviewFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	integrityModels := make([]domain.ModelDefinition, 0)
	for _, model := range s.RankingModels() {
		if model.Kind == "integrity" {
			integrityModels = append(integrityModels, model)
		}
	}
	observationContexts, err := s.consensus.ObservationContexts(domain.ObservationContextFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	surfaceSnapshots, err := s.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	surfaceSnapshotItems, err := s.consensus.SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	captureBatches, err := s.consensus.CaptureBatches(domain.CaptureBatchFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	snapshotPairs, err := s.consensus.SnapshotPairs(domain.SnapshotPairFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	pairMetrics, err := s.consensus.PairMetricSnapshots(domain.PairMetricFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	marketConsensusSnapshots, err := s.consensus.MultiContextConsensusSnapshots(domain.MultiContextConsensusFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	marketAmbiguitySnapshots, err := s.consensus.MarketAmbiguitySnapshots(domain.MarketAmbiguityFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	selectionProbabilitySnapshots, err := s.consensus.SelectionProbabilitySnapshots(domain.SelectionProbabilityFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	rankingVolatilitySnapshots, err := s.consensus.RankingVolatilitySnapshots(domain.RankingVolatilityFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	contextHealthSnapshots, err := s.consensus.ContextHealthSnapshots(domain.ContextHealthFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	consensusScoreProvenance, err := s.consensus.ConsensusScoreProvenances(domain.ConsensusScoreProvenanceFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	captureImportAudits, err := s.consensus.CaptureImportAudits(domain.CaptureImportAuditFilter{})
	if err != nil {
		return ExportBundle{}, err
	}
	consensusModels := consensusengine.RegisteredModels()
	scanTelemetryEvents, _, err := s.store.ScanTelemetryEvents("", 0, 0)
	if err != nil {
		return ExportBundle{}, err
	}
	scanRuntimeSummaries, err := s.store.ScanRuntimeSummaries()
	if err != nil {
		return ExportBundle{}, err
	}
	metadata := make([]domain.LiveProductMetadata, 0, len(products))
	for _, product := range products {
		row, ok, err := s.universe.LatestLiveProductMetadata(product.ID)
		if err != nil {
			return ExportBundle{}, err
		}
		if ok {
			metadata = append(metadata, row)
		}
	}
	out := ExportBundle{
		ExportedAt:                    time.Now().UTC().Format(time.RFC3339),
		App:                           "Market Signal Lab",
		Version:                       "0.3.0-alpha.6.5.3-preview.1",
		Identities:                    ids,
		Analyses:                      []domain.Analysis{},
		Benchmarks:                    []domain.Benchmark{},
		Evidence:                      []domain.EvidenceRecord{},
		Catalogs:                      catalogs,
		Products:                      products,
		ProductMetadata:               metadata,
		Authors:                       authors,
		ResearchQueries:               queries,
		ResearchSessions:              sessions,
		ProductObservations:           observations,
		CatalogSnapshots:              catalogSnapshots,
		ProductSnapshots:              productSnapshots,
		RankingModels:                 s.RankingModels(),
		SourcePolicies:                s.policies.All(),
		SavedViews:                    savedViews,
		Watchlist:                     watchlist,
		MarketMapPlans:                marketMapPlans,
		MarketMapRuns:                 marketMapRuns,
		MarketSurfaceObservations:     marketSurfaceObservations,
		MarketDirections:              marketDirections,
		ProductDirections:             productDirections,
		ProductionInsights:            productionInsights,
		SaturationAlerts:              saturationAlerts,
		AdvancedResearchSeeds:         advancedResearchSeeds,
		ClassificationReviews:         classificationReviews,
		ProductReleases:               productReleases,
		ProductReleaseConflicts:       productReleaseConflicts,
		ProductTrendEvents:            productTrendEvents,
		MarketMapTargetResults:        marketMapTargetResults,
		ObservationSegmentations:      observationSegmentations,
		SampleAudits:                  sampleAudits,
		DataQualityAssessments:        dataQualityAssessments,
		MarketIndexSnapshots:          marketIndexSnapshots,
		ScoreProvenance:               scoreProvenance,
		LegacyClassificationReviews:   legacyClassificationReviews,
		IntegrityModels:               integrityModels,
		ObservationContexts:           observationContexts,
		SurfaceSnapshots:              surfaceSnapshots,
		SurfaceSnapshotItems:          surfaceSnapshotItems,
		CaptureBatches:                captureBatches,
		SnapshotPairs:                 snapshotPairs,
		PairMetrics:                   pairMetrics,
		MarketConsensusSnapshots:      marketConsensusSnapshots,
		MarketAmbiguitySnapshots:      marketAmbiguitySnapshots,
		SelectionProbabilitySnapshots: selectionProbabilitySnapshots,
		RankingVolatilitySnapshots:    rankingVolatilitySnapshots,
		ContextHealthSnapshots:        contextHealthSnapshots,
		ConsensusScoreProvenance:      consensusScoreProvenance,
		CaptureImportAudits:           captureImportAudits,
		ConsensusModels:               consensusModels,
		ScanTelemetryEvents:           scanTelemetryEvents,
		ScanRuntimeSummaries:          scanRuntimeSummaries,
	}
	for _, id := range ids {
		xs, err := s.store.Analyses(id.ID)
		if err != nil {
			return ExportBundle{}, err
		}
		out.Analyses = append(out.Analyses, xs...)
		bs, err := s.store.Benchmarks(id.ID)
		if err != nil {
			return ExportBundle{}, err
		}
		out.Benchmarks = append(out.Benchmarks, bs...)
		es, err := s.store.Evidence(id.ID)
		if err != nil {
			return ExportBundle{}, err
		}
		out.Evidence = append(out.Evidence, es...)
	}
	return out, nil
}

func (s *Service) AddEvidence(v domain.EvidenceRecord) (domain.EvidenceRecord, error) {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	if v.ObservedAt == "" {
		v.ObservedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if v.IdentityID == "" || v.SourceType == "" || v.SourceLabel == "" || v.Metric == "" || v.Unit == "" || v.Method == "" {
		return v, errors.New("identityId, sourceType, sourceLabel, metric, unit, and method are required")
	}
	if _, err := time.Parse(time.RFC3339, v.ObservedAt); err != nil {
		return v, errors.New("observedAt must be RFC3339")
	}
	if v.Unit == "score_0_100" && (v.Value < 0 || v.Value > 100) {
		return v, errors.New("score_0_100 evidence must be between 0 and 100")
	}
	if v.Reliability == "" {
		v.Reliability = "unknown"
	}
	return v, s.store.AppendEvidence(v)
}

func (s *Service) Evidence(identityID string) ([]domain.EvidenceRecord, error) {
	return s.store.Evidence(identityID)
}

func evidenceFeature(metric string, value float64, f *domain.FeatureSet) {
	v := value
	switch metric {
	case "demand_proxy":
		f.DemandProxy = &v
	case "supply_gap":
		f.SupplyGap = &v
	case "market_momentum":
		f.MarketMomentum = &v
	case "competitive_gap":
		f.CompetitiveGap = &v
	case "freshness_gap":
		f.FreshnessGap = &v
	case "external_trend":
		f.ExternalTrend = &v
	case "seasonality":
		f.Seasonality = &v
	}
}

func (s *Service) AnalyzeFromEvidence(identityID string) (domain.Analysis, error) {
	if identityID == "" {
		return domain.Analysis{}, errors.New("identity id is required")
	}
	xs, err := s.store.Evidence(identityID)
	if err != nil {
		return domain.Analysis{}, err
	}
	if len(xs) == 0 {
		return domain.Analysis{}, errors.New("no evidence available")
	}
	scoring := map[string]domain.EvidenceRecord{}
	sourceTypes := map[string]bool{}
	dates := map[string]bool{}
	directElements := false
	now := time.Now().UTC()
	maxAge := 0.0
	for _, e := range xs {
		sourceTypes[e.SourceType] = true
		if t, parseErr := time.Parse(time.RFC3339, e.ObservedAt); parseErr == nil {
			dates[t.UTC().Format("2006-01-02")] = true
		}
		if e.SourceType == "envato_elements_manual" || e.SourceType == "elements_direct" {
			directElements = true
		}
		if e.Unit != "score_0_100" {
			continue
		}
		switch e.Metric {
		case "demand_proxy", "supply_gap", "market_momentum", "competitive_gap", "freshness_gap", "external_trend", "seasonality":
			prev, ok := scoring[e.Metric]
			if !ok || e.ObservedAt > prev.ObservedAt {
				scoring[e.Metric] = e
			}
		}
	}
	var features domain.FeatureSet
	for metric, e := range scoring {
		evidenceFeature(metric, e.Value, &features)
		if t, parseErr := time.Parse(time.RFC3339, e.ObservedAt); parseErr == nil {
			age := now.Sub(t).Hours()
			if age > maxAge {
				maxAge = age
			}
		}
	}
	completeness := float64(len(scoring)) / 7 * 100
	evidenceVolume := float64(len(xs)) * 10
	if evidenceVolume > 100 {
		evidenceVolume = 100
	}
	independent := float64(len(sourceTypes)) / 3 * 100
	if independent > 100 {
		independent = 100
	}
	historyDepth := float64(len(dates)) * 10
	if historyDepth > 100 {
		historyDepth = 100
	}
	consistency := 50.0
	if len(sourceTypes) >= 2 {
		consistency = 75
	}
	recency := 100.0
	if maxAge > 24 {
		recency = 80
	}
	if maxAge > 72 {
		recency = 50
	}
	if maxAge > 168 {
		recency = 25
	}
	a, err := s.buildAnalysis(AnalyzeRequest{IdentityID: identityID, Features: features, Confidence: domain.ConfidenceContext{
		EvidenceVolume: evidenceVolume, RelevantCoverage: completeness, IndependentSources: independent,
		HistoryDepth: historyDepth, FeatureCompleteness: completeness, CrossSourceConsistency: consistency,
		Recency: recency, TargetPlatform: "elements", DirectElementsEvidence: directElements,
		SourceClassCount: len(sourceTypes), HistorySnapshots: len(dates), CriticalEvidenceAgeHours: maxAge,
	}})
	if err != nil {
		return domain.Analysis{}, err
	}
	if maxAge > 72 {
		if a.Warning != "" {
			a.Warning += " "
		}
		a.Warning += "Some scoring evidence is older than 72 hours; confidence is freshness-capped."
	}
	if err := s.store.AppendAnalysis(a); err != nil {
		return domain.Analysis{}, err
	}
	return a, nil
}

func (s *Service) ImportEvidenceCSV(r io.Reader) (int, error) {
	xs, err := ingest.ParseEvidenceCSV(r)
	if err != nil {
		return 0, err
	}
	for i := range xs {
		if _, err := s.AddEvidence(xs[i]); err != nil {
			return i, err
		}
	}
	return len(xs), nil
}

func (s *Service) ResearchEnvatoSearch(ctx context.Context, identityID string, req envatoconn.SearchRequest) (envatoconn.SearchAggregate, domain.EvidenceRecord, error) {
	if identityID == "" {
		return envatoconn.SearchAggregate{}, domain.EvidenceRecord{}, errors.New("identity id is required")
	}
	token, err := s.resolvedEnvatoToken()
	if err != nil {
		return envatoconn.SearchAggregate{}, domain.EvidenceRecord{}, err
	}
	defer func() { token = "" }()

	agg, err := s.envato.Search(ctx, token, req)
	if err != nil {
		return envatoconn.SearchAggregate{}, domain.EvidenceRecord{}, err
	}
	notes := fmt.Sprintf("site=%s; category=%s; returned=%d; total_hits_exact=%t; aggregate only; item payload not retained", agg.Site, agg.Category, agg.Returned, agg.TotalHitsExact)
	e, err := s.AddEvidence(domain.EvidenceRecord{
		IdentityID: identityID, ObservedAt: agg.ObservedAt, SourceType: "envato_market_api",
		SourceLabel: "Envato Market API", Metric: "envato_market_search_hits", Value: float64(agg.TotalHits), Unit: "count",
		Query: agg.Term, SampleSize: agg.Returned, Reliability: "high", Method: "official_api_on_demand", Notes: notes,
	})
	if err != nil {
		return envatoconn.SearchAggregate{}, domain.EvidenceRecord{}, err
	}
	return agg, e, nil
}

func (s *Service) ResearchEnvatoTotalItems(ctx context.Context, identityID string) (envatoconn.TotalItemsAggregate, domain.EvidenceRecord, error) {
	if identityID == "" {
		return envatoconn.TotalItemsAggregate{}, domain.EvidenceRecord{}, errors.New("identity id is required")
	}
	token, err := s.resolvedEnvatoToken()
	if err != nil {
		return envatoconn.TotalItemsAggregate{}, domain.EvidenceRecord{}, err
	}
	defer func() { token = "" }()

	agg, err := s.envato.TotalItems(ctx, token)
	if err != nil {
		return envatoconn.TotalItemsAggregate{}, domain.EvidenceRecord{}, err
	}
	e, err := s.AddEvidence(domain.EvidenceRecord{
		IdentityID: identityID, ObservedAt: agg.ObservedAt, SourceType: "envato_market_api",
		SourceLabel: "Envato Market API", Metric: "envato_market_total_items", Value: float64(agg.TotalItems), Unit: "count",
		Reliability: "high", Method: "official_api_on_demand", Notes: "global Envato Market aggregate; no item payload retained",
	})
	if err != nil {
		return envatoconn.TotalItemsAggregate{}, domain.EvidenceRecord{}, err
	}
	return agg, e, nil
}
