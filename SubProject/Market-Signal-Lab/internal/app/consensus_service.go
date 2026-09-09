package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"marketsignallab/internal/consensus"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/ingest"
	"sort"
	"strings"
	"time"
)

func deterministicConsensusID(prefix string, parts ...string) string {
	sum := sha256.Sum256([]byte(prefix + "|" + strings.Join(parts, "|")))
	return prefix + "-" + hex.EncodeToString(sum[:12])
}

func (s *Service) latestReusableCaptureBatch(snapshot domain.SurfaceSnapshot, ctx domain.ObservationContext, now time.Time) string {
	rows, err := s.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{CatalogPath: snapshot.CatalogPath, SortMode: snapshot.SortMode})
	if err != nil {
		return ""
	}
	for i := len(rows) - 1; i >= 0; i-- {
		row := rows[i]
		if row.FilterHash != snapshot.FilterHash {
			continue
		}
		t, err := time.Parse(time.RFC3339, row.CapturedAt)
		if err != nil || now.Sub(t) > 30*time.Minute || now.Before(t) {
			continue
		}
		contexts, _ := s.consensus.ObservationContexts(domain.ObservationContextFilter{ID: row.ContextID})
		if len(contexts) != 1 {
			continue
		}
		other := contexts[0]
		if other.Platform != ctx.Platform {
			continue
		}
		if other.Experience == ctx.Experience && other.AccessState == ctx.AccessState {
			continue
		}
		return row.CaptureBatchID
	}
	return ""
}

func (s *Service) persistSurfaceUniverse(ctx domain.ObservationContext, items []domain.SurfaceSnapshotItem, observedAt string) error {
	sourceType := string(ctx.Platform)
	for _, it := range items {
		external := it.ExternalItemID
		if external == "" {
			external = it.CanonicalIdentityKey
		}
		product, err := s.universe.UpsertProduct(domain.ProductEntity{SourceType: sourceType, ExternalItemID: external, FirstSeenAt: observedAt, LastSeenAt: observedAt, Status: "observed"})
		if err != nil {
			return err
		}
		authorID := ""
		if strings.TrimSpace(it.AuthorPublicName) != "" {
			a, err := s.universe.UpsertAuthor(domain.AuthorEntity{SourceType: sourceType, ExternalAuthorKey: strings.ToLower(strings.TrimSpace(it.AuthorPublicName)), DisplayName: it.AuthorPublicName, FirstSeenAt: observedAt, LastSeenAt: observedAt})
			if err != nil {
				return err
			}
			authorID = a.ID
		}
		if it.Title != "" || it.SourceURL != "" {
			if err := s.universe.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: product.ID, AuthorID: authorID, SourceType: sourceType, Title: it.Title, AuthorDisplayName: it.AuthorPublicName, SourceURL: it.SourceURL, CategoryText: it.SourceCategory, FetchedAt: observedAt}); err != nil {
				return err
			}
		}
		if it.FirstReleaseAt != "" {
			_, _, _ = s.universe.UpsertProductRelease(domain.ProductReleaseRecord{ProductID: product.ID, ReleasedAt: it.FirstReleaseAt, Precision: domain.ReleasePrecisionDateTime, SourceType: sourceType, SourceField: "cross_surface_capture", SourceURL: it.SourceURL, VerifiedAt: observedAt})
		}
	}
	return nil
}

func (s *Service) CreateSurfaceSnapshot(payload domain.SurfaceCapturePayload) (domain.SurfaceSnapshotView, error) {
	now := time.Now().UTC()
	ctx, snap, items, audit, err := ingest.BuildSurfaceSnapshot(payload, now)
	if err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	if batch := s.latestReusableCaptureBatch(snap, ctx, now); batch != "" {
		snap.CaptureBatchID = batch
		audit.CaptureBatchID = batch
	} else {
		batch := domain.CaptureBatch{ID: snap.CaptureBatchID, Label: "Cross-surface capture", CreatedAt: now.Format(time.RFC3339), SnapshotIDs: []string{snap.ID}, ContextTypes: []string{string(ctx.Experience)}, PairToleranceMinutes: 10, CapturePolicyVersion: "capture-policy-v0.1", Status: "open"}
		if err := s.consensus.AppendCaptureBatch(batch); err != nil {
			return domain.SurfaceSnapshotView{}, err
		}
	}
	if err := s.consensus.AppendObservationContext(ctx); err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	if err := s.consensus.AppendSurfaceSnapshot(snap); err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	for _, it := range items {
		if err := s.consensus.AppendSurfaceSnapshotItem(it); err != nil {
			return domain.SurfaceSnapshotView{}, err
		}
	}
	if err := s.consensus.AppendCaptureImportAudit(audit); err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	if err := s.persistSurfaceUniverse(ctx, items, snap.CapturedAt); err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	tax, idres := 0.0, 0.0
	if len(items) > 0 {
		for _, it := range items {
			tax += it.TaxonomyConfidence * 100
			idres += it.IdentityConfidence * 100
		}
		tax /= float64(len(items))
		idres /= float64(len(items))
	}
	health := consensus.BuildContextHealth(consensus.ContextHealthInput{ContextID: ctx.ID, CaptureBatchID: snap.CaptureBatchID, Coverage: snap.Coverage, ContextCompleteness: 100, TimeAlignment: 100, TopKDepth: snap.Coverage, TaxonomyConfidence: tax, IdentityResolution: idres, SourceReliability: snap.SourceReliability, HistoricalDepth: 0, ContextDiversity: 0, GeneratedAt: now})
	_ = s.consensus.AppendContextHealthSnapshot(health)
	return domain.SurfaceSnapshotView{Context: ctx, CaptureBatchID: snap.CaptureBatchID, Snapshot: snap, Items: items, Audit: audit}, nil
}

func (s *Service) AutoPairCaptureBatch(batchID string, tolerance time.Duration) ([]domain.SnapshotPair, error) {
	snaps, err := s.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{CaptureBatchID: batchID})
	if err != nil {
		return nil, err
	}
	if len(snaps) < 2 {
		return []domain.SnapshotPair{}, nil
	}
	ctxs := map[string]domain.ObservationContext{}
	for _, snap := range snaps {
		rows, _ := s.consensus.ObservationContexts(domain.ObservationContextFilter{ID: snap.ContextID})
		if len(rows) == 1 {
			ctxs[snap.ContextID] = rows[0]
		}
	}
	out := []domain.SnapshotPair{}
	for i := 0; i < len(snaps); i++ {
		for j := i + 1; j < len(snaps); j++ {
			a, b := snaps[i], snaps[j]
			ca, oka := ctxs[a.ContextID]
			cb, okb := ctxs[b.ContextID]
			if !oka || !okb {
				continue
			}
			if ca.Experience == cb.Experience && ca.AccessState == cb.AccessState {
				continue
			}
			cmp := consensus.ComparePairContexts(ca, cb, tolerance)
			ids := []string{a.ID, b.ID}
			sort.Strings(ids)
			at, _ := time.Parse(time.RFC3339, a.CapturedAt)
			bt, _ := time.Parse(time.RFC3339, b.CapturedAt)
			delta := at.Sub(bt)
			if delta < 0 {
				delta = -delta
			}
			pair := domain.SnapshotPair{ID: deterministicConsensusID("pair", ids...), CaptureBatchID: batchID, SnapshotAID: a.ID, SnapshotBID: b.ID, ContextAID: ca.ID, ContextBID: cb.ID, Comparable: cmp.Comparable, CommonTopK: cmp.CommonTopK, CaptureDeltaMs: delta.Milliseconds(), ReasonCodes: cmp.ReasonCodes, ComparabilityModel: cmp.ModelVersion, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
			if err := s.consensus.AppendSnapshotPair(pair); err != nil {
				return nil, err
			}
			out = append(out, pair)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (s *Service) loadPairSnapshot(snapshotID string) (consensus.PairSnapshot, error) {
	snaps, err := s.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{ID: snapshotID})
	if err != nil || len(snaps) != 1 {
		return consensus.PairSnapshot{}, errors.New("surface snapshot not found")
	}
	snap := snaps[0]
	ctxs, err := s.consensus.ObservationContexts(domain.ObservationContextFilter{ID: snap.ContextID})
	if err != nil || len(ctxs) != 1 {
		return consensus.PairSnapshot{}, errors.New("observation context not found")
	}
	items, err := s.consensus.SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter{SnapshotID: snapshotID})
	if err != nil {
		return consensus.PairSnapshot{}, err
	}
	return consensus.PairSnapshot{Snapshot: snap, Context: ctxs[0], Items: items}, nil
}

func (s *Service) PairComparison(pairID string) (domain.PairComparisonView, error) {
	pairs, err := s.consensus.SnapshotPairs(domain.SnapshotPairFilter{ID: pairID})
	if err != nil || len(pairs) != 1 {
		return domain.PairComparisonView{}, errors.New("snapshot pair not found")
	}
	pair := pairs[0]
	a, err := s.loadPairSnapshot(pair.SnapshotAID)
	if err != nil {
		return domain.PairComparisonView{}, err
	}
	b, err := s.loadPairSnapshot(pair.SnapshotBID)
	if err != nil {
		return domain.PairComparisonView{}, err
	}
	metrics, _ := s.consensus.PairMetricSnapshots(domain.PairMetricFilter{PairID: pairID})
	ambs, _ := s.consensus.MarketAmbiguitySnapshots(domain.MarketAmbiguityFilter{PairID: pairID})
	var metric domain.PairMetricSnapshot
	var amb domain.MarketAmbiguitySnapshot
	var prov domain.ConsensusScoreProvenance
	if len(metrics) > 0 {
		metric = metrics[len(metrics)-1]
		provs, _ := s.consensus.ConsensusScoreProvenances(domain.ConsensusScoreProvenanceFilter{ID: metric.ProvenanceID})
		if len(provs) > 0 {
			prov = provs[len(provs)-1]
		}
	}
	if len(ambs) > 0 {
		amb = ambs[len(ambs)-1]
	}
	ma := map[string]domain.SurfaceSnapshotItem{}
	mb := map[string]domain.SurfaceSnapshotItem{}
	for _, x := range a.Items {
		ma[x.CanonicalIdentityKey] = x
	}
	for _, x := range b.Items {
		mb[x.CanonicalIdentityKey] = x
	}
	shared := []domain.SurfaceSnapshotItem{}
	ua := []domain.SurfaceSnapshotItem{}
	ub := []domain.SurfaceSnapshotItem{}
	for k, x := range ma {
		if _, ok := mb[k]; ok {
			shared = append(shared, x)
		} else {
			ua = append(ua, x)
		}
	}
	for k, x := range mb {
		if _, ok := ma[k]; !ok {
			ub = append(ub, x)
		}
	}
	sort.Slice(shared, func(i, j int) bool { return shared[i].Rank < shared[j].Rank })
	sort.Slice(ua, func(i, j int) bool { return ua[i].Rank < ua[j].Rank })
	sort.Slice(ub, func(i, j int) bool { return ub[i].Rank < ub[j].Rank })
	return domain.PairComparisonView{Pair: pair, ContextA: a.Context, ContextB: b.Context, SnapshotA: a.Snapshot, SnapshotB: b.Snapshot, PairMetrics: metric, Ambiguity: amb, SharedItems: shared, UniqueA: ua, UniqueB: ub, Provenance: prov}, nil
}

func (s *Service) CalculatePair(pairID string) (domain.PairComparisonView, error) {
	existing, _ := s.consensus.PairMetricSnapshots(domain.PairMetricFilter{PairID: pairID})
	if len(existing) > 0 {
		return s.PairComparison(pairID)
	}
	pairs, err := s.consensus.SnapshotPairs(domain.SnapshotPairFilter{ID: pairID})
	if err != nil || len(pairs) != 1 {
		return domain.PairComparisonView{}, errors.New("snapshot pair not found")
	}
	pair := pairs[0]
	if !pair.Comparable {
		return domain.PairComparisonView{}, errors.New("snapshot pair is not comparable")
	}
	a, err := s.loadPairSnapshot(pair.SnapshotAID)
	if err != nil {
		return domain.PairComparisonView{}, err
	}
	b, err := s.loadPairSnapshot(pair.SnapshotBID)
	if err != nil {
		return domain.PairComparisonView{}, err
	}
	q := a.Snapshot.DataQualityScore
	if b.Snapshot.DataQualityScore < q {
		q = b.Snapshot.DataQualityScore
	}
	grade := a.Snapshot.DataQualityGrade
	if b.Snapshot.DataQualityGrade > grade { /* lexical not quality order; choose conservative below */
	}
	if !qualityGradeAtLeastB(a.Snapshot.DataQualityGrade) || !qualityGradeAtLeastB(b.Snapshot.DataQualityGrade) {
		if a.Snapshot.DataQualityGrade == domain.DataQualityGradeD || b.Snapshot.DataQualityGrade == domain.DataQualityGradeD {
			grade = domain.DataQualityGradeD
		} else {
			grade = domain.DataQualityGradeC
		}
	}
	cov := a.Snapshot.Coverage
	if b.Snapshot.Coverage < cov {
		cov = b.Snapshot.Coverage
	}
	conf := a.Snapshot.Confidence
	if b.Snapshot.Confidence < conf {
		conf = b.Snapshot.Confidence
	}
	allMetrics, _ := s.consensus.PairMetricSnapshots(domain.PairMetricFilter{})
	batchCount := 1
	if len(allMetrics) > 0 {
		batchCount = len(allMetrics) + 1
	}
	metric, amb, prov, err := consensus.BuildPairMetricsWithEngine(context.Background(), s.analyticsEngine, consensus.PairMetricInput{PairID: pairID, SnapshotA: a, SnapshotB: b, CommonTopK: pair.CommonTopK, DataQualityScore: q, DataQualityGrade: grade, Coverage: cov, Confidence: conf, ComparableBatches: batchCount, GeneratedAt: time.Now().UTC()})
	if err != nil {
		return domain.PairComparisonView{}, err
	}
	if err := s.consensus.AppendPairMetricSnapshot(metric); err != nil {
		return domain.PairComparisonView{}, err
	}
	if err := s.consensus.AppendMarketAmbiguitySnapshot(amb); err != nil {
		return domain.PairComparisonView{}, err
	}
	if err := s.consensus.AppendConsensusScoreProvenance(prov); err != nil {
		return domain.PairComparisonView{}, err
	}
	return s.PairComparison(pairID)
}

func qualityGradeAtLeastB(g domain.DataQualityGrade) bool {
	return g == domain.DataQualityGradeA || g == domain.DataQualityGradeB
}

func (s *Service) RefreshMultiContextConsensus(req domain.ConsensusRefreshRequest) (domain.MarketConsensusView, error) {
	snaps, err := s.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{CaptureBatchID: req.CaptureBatchID, CatalogPath: req.CatalogPath, From: req.From, To: req.To})
	if err != nil {
		return domain.MarketConsensusView{}, err
	}
	if len(snaps) == 0 {
		return s.ConsensusDashboard(domain.ConsensusDashboardFilter{CatalogPath: req.CatalogPath, From: req.From, To: req.To})
	}

	type group struct {
		entityType, id, label string
		snapshots             map[string]bool
		contexts              map[string]bool
		items                 map[string]bool
		ranks                 []float64
		totalOccurrences      int
	}
	groups := map[string]*group{}
	ctxMap := map[string]domain.ObservationContext{}
	allContextTypes := map[string]bool{}
	batchSet := map[string]bool{}

	for _, snap := range snaps {
		batchSet[snap.CaptureBatchID] = true
		ctxs, _ := s.consensus.ObservationContexts(domain.ObservationContextFilter{ID: snap.ContextID})
		if len(ctxs) != 1 {
			continue
		}
		ctx := ctxs[0]
		ctxMap[snap.ID] = ctx
		ctype := string(ctx.Experience) + "|" + string(ctx.AccessState)
		allContextTypes[ctype] = true
		items, _ := s.consensus.SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter{SnapshotID: snap.ID})
		for _, it := range items {
			specs := []struct{ t, id string }{
				{"catalog", it.NormalizedCatalogID}, {"product_type", it.ProductTypeID}, {"use_case", it.UseCaseID},
			}
			for _, spec := range specs {
				if spec.id == "" {
					continue
				}
				key := spec.t + "|" + spec.id
				g := groups[key]
				if g == nil {
					g = &group{entityType: spec.t, id: spec.id, label: spec.id, snapshots: map[string]bool{}, contexts: map[string]bool{}, items: map[string]bool{}}
					groups[key] = g
				}
				g.snapshots[snap.ID] = true
				g.contexts[ctype] = true
				g.items[it.CanonicalIdentityKey] = true
				g.totalOccurrences++
				if snap.TopKObserved > 0 {
					g.ranks = append(g.ranks, 100*float64(snap.TopKObserved-it.Rank+1)/float64(snap.TopKObserved))
				}
			}
		}
	}

	matrix := []domain.ContextMatrixRow{}
	batchCount := len(batchSet)
	for _, g := range groups {
		presence := 100 * float64(len(g.snapshots)) / float64(len(snaps))
		breadth := 0.0
		if len(allContextTypes) > 0 {
			breadth = 100 * float64(len(g.contexts)) / float64(len(allContextTypes))
		}
		rankStrength := 0.0
		for _, v := range g.ranks {
			rankStrength += v
		}
		if len(g.ranks) > 0 {
			rankStrength /= float64(len(g.ranks))
		}
		independent := 100.0
		if g.totalOccurrences > 0 {
			independent = 100 * float64(len(g.items)) / float64(g.totalOccurrences)
		}
		quality := 0.0
		for _, snap := range snaps {
			quality += snap.DataQualityScore
		}
		quality /= float64(len(snaps))
		grade := qualityGradeFromScore(quality)
		contexts := []string{}
		for c := range g.contexts {
			contexts = append(contexts, c)
		}
		snapshotIDs := []string{}
		for id := range g.snapshots {
			snapshotIDs = append(snapshotIDs, id)
		}

		cluster, prov, err := consensus.BuildClusterConsensus(consensus.ClusterConsensusInput{
			CaptureBatchID: req.CaptureBatchID, EntityType: g.entityType, EntityID: g.id, Label: g.label,
			ContextTypes: contexts, EligibleSnapshotIDs: snapshotIDs, EligibleSnapshots: len(snapshotIDs), ComparableBatchCount: batchCount,
			ContextPresenceRate: presence, ContextBreadth: breadth, CrossTimePersistence: presence, RankShareStrength: rankStrength,
			IndependentItemBreadth: independent, EvidenceQuality: quality, UnresolvedTaxonomyShare: 0, ContextDominance: 100 - breadth,
			Coverage: presence, Confidence: quality, DataQualityScore: quality, DataQualityGrade: grade, GeneratedAt: time.Now().UTC(),
		})
		if err != nil {
			continue
		}
		_ = s.consensus.AppendMultiContextConsensusSnapshot(cluster)
		_ = s.consensus.AppendConsensusScoreProvenance(prov)

		obs := []consensus.SelectionObservation{}
		strength := map[string]float64{}
		idsByCtx := map[string][]string{}
		for _, snap := range snaps {
			ctx := ctxMap[snap.ID]
			ctype := string(ctx.Experience) + "|" + string(ctx.AccessState)
			selected := g.snapshots[snap.ID]
			obs = append(obs, consensus.SelectionObservation{SnapshotID: snap.ID, ContextType: ctype, Weight: 1, Selected: selected})
			if selected {
				strength[ctype] += 100
				idsByCtx[ctype] = append(idsByCtx[ctype], snap.ID)
			}
		}
		for c := range strength {
			count := 0
			for _, snap := range snaps {
				ctx := ctxMap[snap.ID]
				if string(ctx.Experience)+"|"+string(ctx.AccessState) == c {
					count++
				}
			}
			if count > 0 {
				strength[c] /= float64(count)
			}
		}
		sel, _ := consensus.BuildSelectionProbabilityWithEngine(context.Background(), s.analyticsEngine, consensus.SelectionInput{EntityType: g.entityType, EntityID: g.id, Observations: obs, ContextTypes: contexts, Coverage: presence, Confidence: quality, DataQualityScore: quality, DataQualityGrade: grade, GeneratedAt: time.Now().UTC()})
		_ = s.consensus.AppendSelectionProbabilitySnapshot(sel)

		shares := []float64{}
		for _, snap := range snaps {
			items, _ := s.consensus.SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter{SnapshotID: snap.ID})
			n := 0
			for _, it := range items {
				if (g.entityType == "catalog" && it.NormalizedCatalogID == g.id) || (g.entityType == "product_type" && it.ProductTypeID == g.id) || (g.entityType == "use_case" && it.UseCaseID == g.id) {
					n++
				}
			}
			share := 0.0
			if len(items) > 0 {
				share = 100 * float64(n) / float64(len(items))
			}
			shares = append(shares, share)
		}
		vol, _ := consensus.BuildClusterVolatilityWithEngine(context.Background(), s.analyticsEngine, consensus.ClusterVolatilityInput{EntityType: g.entityType, EntityID: g.id, Shares: shares, ContextDisagreement: 100 - breadth, CrossTimePersistence: presence, SnapshotIDs: snapshotIDs, GeneratedAt: time.Now().UTC()})
		_ = s.consensus.AppendRankingVolatilitySnapshot(vol)
		matrix = append(matrix, consensus.BuildContextMatrixRow(g.entityType, g.id, g.label, strength, idsByCtx, cluster.Score, 100-cluster.Score, vol.Score, sel.Score, cluster.SignalState, grade, cluster.ProvenanceID))
	}
	view, err := s.ConsensusDashboard(domain.ConsensusDashboardFilter{CatalogPath: req.CatalogPath, From: req.From, To: req.To})
	if err == nil {
		view.Matrix = matrix
	}
	return view, err
}

func qualityGradeFromScore(score float64) domain.DataQualityGrade {
	switch {
	case score >= 85:
		return domain.DataQualityGradeA
	case score >= 70:
		return domain.DataQualityGradeB
	case score >= 50:
		return domain.DataQualityGradeC
	default:
		return domain.DataQualityGradeD
	}
}

func (s *Service) ConsensusDashboard(f domain.ConsensusDashboardFilter) (domain.MarketConsensusView, error) {
	health, err := s.consensus.ContextHealthSnapshots(domain.ContextHealthFilter{From: f.From, To: f.To, Limit: f.Limit})
	if err != nil {
		return domain.MarketConsensusView{}, err
	}
	pairs, err := s.consensus.SnapshotPairs(domain.SnapshotPairFilter{From: f.From, To: f.To, Limit: f.Limit})
	if err != nil {
		return domain.MarketConsensusView{}, err
	}
	metrics, err := s.consensus.PairMetricSnapshots(domain.PairMetricFilter{From: f.From, To: f.To, Limit: f.Limit})
	if err != nil {
		return domain.MarketConsensusView{}, err
	}
	ambs, _ := s.consensus.MarketAmbiguitySnapshots(domain.MarketAmbiguityFilter{From: f.From, To: f.To, Limit: f.Limit})
	signals, _ := s.consensus.MultiContextConsensusSnapshots(domain.MultiContextConsensusFilter{EntityType: f.EntityType, SignalState: f.SignalState, From: f.From, To: f.To, Limit: f.Limit})
	selection, _ := s.consensus.SelectionProbabilitySnapshots(domain.SelectionProbabilityFilter{EntityType: f.EntityType, From: f.From, To: f.To, Limit: f.Limit})
	vol, _ := s.consensus.RankingVolatilitySnapshots(domain.RankingVolatilityFilter{EntityType: f.EntityType, From: f.From, To: f.To, Limit: f.Limit})
	batches := map[string]bool{}
	for _, p := range pairs {
		if p.Comparable {
			batches[p.CaptureBatchID] = true
		}
	}
	stage := consensus.EvidenceStage(len(batches))
	return domain.MarketConsensusView{ContextHealth: health, LatestPairs: pairs, PairMetrics: metrics, Ambiguities: ambs, ConsensusSignals: signals, Selection: selection, Volatility: vol, EvidenceStage: string(stage), ComparableBatches: len(batches)}, nil
}

func (s *Service) ContextMatrix(f domain.ContextMatrixFilter) ([]domain.ContextMatrixRow, error) {
	view, err := s.ConsensusDashboard(domain.ConsensusDashboardFilter{CatalogPath: f.CatalogPath, ContentType: f.ContentType, EntityType: f.EntityType, From: f.From, To: f.To, Limit: f.Limit})
	if err != nil {
		return nil, err
	}
	rows := []domain.ContextMatrixRow{}
	selMap := map[string]float64{}
	volMap := map[string]float64{}
	ambMap := map[string]float64{}
	for _, x := range view.Selection {
		selMap[x.EntityType+"|"+x.EntityID] = x.Score
	}
	for _, x := range view.Volatility {
		volMap[x.EntityType+"|"+x.EntityID] = x.Score
	}
	for _, x := range view.ConsensusSignals {
		ambMap[x.EntityType+"|"+x.EntityID] = 100 - x.Score
	}
	for _, x := range view.ConsensusSignals {
		strength := map[string]float64{}
		snaps := map[string][]string{}
		for _, c := range x.ContextTypes {
			strength[c] = x.Score
		}
		rows = append(rows, consensus.BuildContextMatrixRow(x.EntityType, x.EntityID, x.Label, strength, snaps, x.Score, ambMap[x.EntityType+"|"+x.EntityID], volMap[x.EntityType+"|"+x.EntityID], selMap[x.EntityType+"|"+x.EntityID], x.SignalState, x.DataQualityGrade, x.ProvenanceID))
	}
	return rows, nil
}
