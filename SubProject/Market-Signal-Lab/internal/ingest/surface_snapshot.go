package ingest

import (
	"errors"
	"marketsignallab/internal/consensus"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/security"
	"sort"
	"strings"
	"time"
)

func canonicalItemKey(item domain.SurfaceCaptureItem) (string, float64, error) {
	if id := strings.TrimSpace(item.ExternalItemID); id != "" {
		return "envato-id:" + id, 1, nil
	}
	cleaned, err := security.CanonicalEnvatoItemURL(item.SourceURL)
	if err != nil {
		return "", 0, errors.New("item requires externalItemId or valid Envato item URL")
	}
	return "envato-url:" + cleaned, .70, nil
}

func BuildSurfaceSnapshot(payload domain.SurfaceCapturePayload, now time.Time) (domain.ObservationContext, domain.SurfaceSnapshot, []domain.SurfaceSnapshotItem, domain.CaptureImportAudit, error) {
	if err := security.ValidateCapturePayload(payload); err != nil {
		return domain.ObservationContext{}, domain.SurfaceSnapshot{}, nil, domain.CaptureImportAudit{}, err
	}
	input := payload.Context
	if payload.TopKRequested > 0 {
		input.PageSizeOrTopK = payload.TopKRequested
	}
	ctx, err := consensus.CanonicalizeContext(input, now)
	if err != nil {
		return domain.ObservationContext{}, domain.SurfaceSnapshot{}, nil, domain.CaptureImportAudit{}, err
	}
	batchID := domain.NewID()
	snapID := domain.NewID()
	items := make([]domain.SurfaceSnapshotItem, 0, len(payload.Items))
	for _, in := range payload.Items {
		key, identConf, err := canonicalItemKey(in)
		if err != nil {
			return domain.ObservationContext{}, domain.SurfaceSnapshot{}, nil, domain.CaptureImportAudit{}, err
		}
		cleanURL := ""
		if in.SourceURL != "" {
			cleanURL, _ = security.CanonicalEnvatoItemURL(in.SourceURL)
		}
		tax := in.TaxonomyConfidence
		if tax == 0 {
			tax = .50
		}
		items = append(items, domain.SurfaceSnapshotItem{ID: domain.NewID(), SnapshotID: snapID, Rank: in.Rank, ExternalItemID: strings.TrimSpace(in.ExternalItemID), CanonicalIdentityKey: key, SourceURL: cleanURL, Title: strings.TrimSpace(in.Title), AuthorPublicName: strings.TrimSpace(in.AuthorPublicName), SourceCategory: strings.TrimSpace(in.SourceCategory), NormalizedCatalogID: strings.TrimSpace(in.NormalizedCatalogID), ProductTypeID: strings.TrimSpace(in.ProductTypeID), UseCaseID: strings.TrimSpace(in.UseCaseID), TopicOrStyleID: strings.TrimSpace(in.TopicOrStyleID), TaxonomyConfidence: tax, IdentityConfidence: identConf, FirstReleaseAt: in.FirstReleaseAt, FirstDetectedAt: in.FirstDetectedAt})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Rank < items[j].Rank })
	coverage := 0.0
	if payload.TopKRequested > 0 {
		coverage = 100 * float64(len(items)) / float64(payload.TopKRequested)
		if coverage > 100 {
			coverage = 100
		}
	}
	quality := 70.0
	if payload.CaptureStatus == "complete" && coverage >= 80 {
		quality = 85
	}
	grade := domain.DataQualityGradeB
	if quality >= 85 {
		grade = domain.DataQualityGradeA
	}
	snapshot := domain.SurfaceSnapshot{ID: snapID, ContextID: ctx.ID, CaptureBatchID: batchID, CatalogPath: ctx.CatalogPath, SortMode: ctx.SortMode, FilterHash: ctx.FilterHash, TopKRequested: payload.TopKRequested, TopKObserved: len(items), CapturedAt: now.UTC().Format(time.RFC3339), CaptureDurationMs: payload.CaptureDurationMs, CaptureStatus: strings.ToLower(payload.CaptureStatus), SourceReliability: 85, Coverage: coverage, Confidence: minFloat(90, 60+coverage*.3), DataQualityScore: quality, DataQualityGrade: grade, ModelVersion: "surface-snapshot-v0.1", ItemCount: len(items)}
	audit := domain.CaptureImportAudit{ID: domain.NewID(), CaptureBatchID: batchID, ContextID: ctx.ID, SnapshotID: snapID, SourceMethod: string(ctx.SourceMethod), PageURL: payload.PageURL, ExtractorVersion: payload.ExtractorVersion, ImportedAt: now.UTC().Format(time.RFC3339), Accepted: true, ItemCount: len(items)}
	return ctx, snapshot, items, audit, nil
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
