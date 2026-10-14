package app

import (
	"context"
	"encoding/json"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"math"
	"strings"
	"testing"
	"time"
)

type appConsensusMathEngine struct{ appTestEngine }

func (e *appConsensusMathEngine) DistributionSimilarity(_ context.Context, in analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	e.distCalls++
	normalize := func(src map[string]float64) map[string]float64 {
		out := map[string]float64{}
		total := 0.0
		for k, v := range src {
			if v > 0 && !math.IsNaN(v) && !math.IsInf(v, 0) {
				out[k] = v
				total += v
			}
		}
		if total > 0 {
			for k, v := range out {
				out[k] = v / total
			}
		}
		return out
	}
	a, b := normalize(in.A), normalize(in.B)
	if len(a) == 0 || len(b) == 0 {
		return analyticsengine.DistributionSimilarityResult{}, nil
	}
	keys := map[string]bool{}
	for k := range a {
		keys[k] = true
	}
	for k := range b {
		keys[k] = true
	}
	mid := map[string]float64{}
	for k := range keys {
		mid[k] = (a[k] + b[k]) / 2
	}
	kl := func(p map[string]float64) float64 {
		sum := 0.0
		for k, pv := range p {
			if pv > 0 && mid[k] > 0 {
				sum += pv * math.Log(pv/mid[k])
			}
		}
		return sum
	}
	score := 100 * (1 - (0.5*kl(a)+0.5*kl(b))/math.Log(2))
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return analyticsengine.DistributionSimilarityResult{Score: score}, nil
}

type captureItem struct {
	rank            int
	id, productType string
}

func newConsensusTestService(t *testing.T) *Service {
	t.Helper()
	s, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return NewWithAnalyticsEngine(s, &appConsensusMathEngine{appTestEngine: appTestEngine{name: "test-rust"}})
}

func capturePayload(experience, access, label string, items []captureItem) domain.SurfaceCapturePayload {
	out := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: domain.ObservationExperience(experience), AccessState: domain.ObservationAccessState(access), SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30, ContextLabel: label}, PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test"}
	for _, x := range items {
		out.Items = append(out.Items, domain.SurfaceCaptureItem{Rank: x.rank, ExternalItemID: x.id, SourceURL: "https://elements.envato.com/" + x.id + "-ABC123", Title: x.id, ProductTypeID: x.productType, UseCaseID: "product_mockup", NormalizedCatalogID: "graphic_templates", TaxonomyConfidence: .9})
	}
	return out
}
func capturePayloadWithSort(experience, sortMode string) domain.SurfaceCapturePayload {
	p := capturePayload(experience, "anonymous", experience, []captureItem{{1, "p1", "mockup"}})
	p.Context.SortMode = sortMode
	if experience == "subscriber_app" {
		p.Context.AccessState = "active_subscriber"
	}
	return p
}

func TestPublicSubscriberPairProducesSeparateConsensusScores(t *testing.T) {
	svc := newConsensusTestService(t)
	public := capturePayload("public_web", "anonymous", "Edge Public", []captureItem{{1, "p1", "packaging_mockup"}, {2, "p2", "packaging_mockup"}})
	subscriber := capturePayload("subscriber_app", "active_subscriber", "Chrome Subscriber", []captureItem{{1, "p3", "packaging_mockup"}, {2, "p4", "packaging_mockup"}})
	a, err := svc.CreateSurfaceSnapshot(public)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CreateSurfaceSnapshot(subscriber)
	if err != nil {
		t.Fatal(err)
	}
	pairs, err := svc.AutoPairCaptureBatch(a.CaptureBatchID, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(pairs) != 1 || pairs[0].SnapshotAID == pairs[0].SnapshotBID {
		t.Fatalf("pairs=%+v", pairs)
	}
	view, err := svc.CalculatePair(pairs[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if view.PairMetrics.ItemConsensus >= 45 || view.PairMetrics.ConceptConsensus < 90 {
		t.Fatalf("view=%+v", view)
	}
	if view.PairMetrics.EstablishedTrend {
		t.Fatal("one pair cannot be an established trend")
	}
}

func TestNonComparableSnapshotsRemainStoredWithoutMetrics(t *testing.T) {
	svc := newConsensusTestService(t)
	a, _ := svc.CreateSurfaceSnapshot(capturePayloadWithSort("public_web", "popular"))
	_, _ = svc.CreateSurfaceSnapshot(capturePayloadWithSort("subscriber_app", "new"))
	// force both snapshots into one audit batch for candidate-pair review
	snaps, _ := svc.consensus.SurfaceSnapshots(domain.SurfaceSnapshotFilter{})
	for _, snap := range snaps {
		if snap.SortMode != "new" {
			continue
		}
		_ = svc.consensus.AppendSurfaceSnapshot(domain.SurfaceSnapshot{ID: domain.NewID(), ContextID: snap.ContextID, CaptureBatchID: a.CaptureBatchID, CatalogPath: snap.CatalogPath, SortMode: snap.SortMode, FilterHash: snap.FilterHash, TopKRequested: snap.TopKRequested, TopKObserved: snap.TopKObserved, CapturedAt: snap.CapturedAt, CaptureStatus: snap.CaptureStatus, SourceReliability: snap.SourceReliability, Coverage: snap.Coverage, Confidence: snap.Confidence, DataQualityScore: snap.DataQualityScore, DataQualityGrade: snap.DataQualityGrade, ModelVersion: snap.ModelVersion, ItemCount: snap.ItemCount})
		break
	}
	pairs, err := svc.AutoPairCaptureBatch(a.CaptureBatchID, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(pairs) != 1 || pairs[0].Comparable {
		t.Fatalf("pairs=%+v", pairs)
	}
	metrics, err := svc.consensus.PairMetricSnapshots(domain.PairMetricFilter{PairID: pairs[0].ID})
	if err != nil || len(metrics) != 0 {
		t.Fatalf("metrics=%+v err=%v", metrics, err)
	}
}

func TestOfficialAPIAdapterCreatesPersonalTokenContextWithoutPersistingToken(t *testing.T) {
	svc := newConsensusTestService(t)
	snapshot, err := svc.BuildOfficialAPISnapshot("market-map-run-1", "popular", 30, "2026-08-16T10:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Context.AccessState != "personal_token" || snapshot.Context.Experience != "market_api" {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(bundle)
	if strings.Contains(strings.ToLower(string(data)), "personal token value") {
		t.Fatal("token leaked")
	}
}
