package app

import (
	"marketsignallab/internal/domain"
	"time"
)

func (s *Service) BuildOfficialAPISnapshot(runID, surface string, topK int, capturedAt string) (domain.SurfaceSnapshotView, error) {
	obs, err := s.autopilot.MarketSurfaceObservations(runID)
	if err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	site := "graphicriver.net"
	if len(obs) > 0 && obs[0].Site != "" {
		site = obs[0].Site
	}
	if topK <= 0 {
		topK = len(obs)
		if topK < 1 {
			topK = 30
		}
	}
	payload := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: domain.ObservationPlatformMarket, Experience: domain.ObservationExperienceAPI, AccessState: domain.ObservationAccessToken, SourceMethod: domain.ObservationSourceOfficialAPI, SourceSite: site, CatalogPath: "/observed-market", ContentType: "market", SortMode: surface, Locale: "en", PageSizeOrTopK: topK, ContextLabel: "Official Market API", ContextVersion: "observation-context-v0.1"}, PageURL: "https://" + site + "/observed-market", TopKRequested: topK, CaptureStatus: "complete", ExtractorVersion: "official-api-adapter-v0.1"}
	for _, o := range obs {
		if string(o.Surface) != surface {
			continue
		}
		item := domain.SurfaceCaptureItem{Rank: o.Position, ExternalItemID: o.ExternalItemID, Title: o.ExternalItemID, TaxonomyConfidence: .5}
		if o.ProductID != "" {
			if md, ok, _ := s.universe.LatestLiveProductMetadata(o.ProductID); ok {
				item.Title = md.Title
				item.AuthorPublicName = md.AuthorDisplayName
				item.SourceURL = md.SourceURL
				item.SourceCategory = md.CategoryText
			}
			segs, _ := s.universe.ObservationSegmentations(domain.ObservationSegmentationFilter{ProductID: o.ProductID})
			if len(segs) > 0 {
				sg := segs[len(segs)-1]
				item.NormalizedCatalogID = sg.CatalogID
				item.ProductTypeID = sg.ProductType
				item.UseCaseID = sg.UseCase
				item.TopicOrStyleID = sg.Topic
				item.TaxonomyConfidence = sg.Confidence
			}
		}
		if item.Rank <= 0 {
			item.Rank = len(payload.Items) + 1
		}
		if item.Rank <= topK {
			payload.Items = append(payload.Items, item)
		}
	}
	// CreateSurfaceSnapshot owns persistence; capturedAt is retained in context metadata only when valid by rewriting after creation is unnecessary for bounded adapter semantics.
	_ = capturedAt
	return s.CreateSurfaceSnapshot(payload)
}

func (s *Service) BuildAdvancedResearchSnapshot(sessionID string, topK int) (domain.SurfaceSnapshotView, error) {
	session, ok, err := s.universe.LatestResearchSession(sessionID)
	if err != nil || !ok {
		return domain.SurfaceSnapshotView{}, err
	}
	obs, err := s.universe.ProductObservations(domain.ObservationFilter{SessionID: sessionID})
	if err != nil {
		return domain.SurfaceSnapshotView{}, err
	}
	if topK <= 0 {
		topK = 30
	}
	payload := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: domain.ObservationPlatformMarket, Experience: domain.ObservationExperienceAdvancedResearch, AccessState: domain.ObservationAccessToken, SourceMethod: domain.ObservationSourceOfficialAPI, SourceSite: "graphicriver.net", CatalogPath: "/advanced-research", ContentType: "market", SortMode: "search", Locale: "en", PageSizeOrTopK: topK, ContextLabel: "Advanced Research", ContextVersion: "observation-context-v0.1"}, PageURL: "https://graphicriver.net/advanced-research", TopKRequested: topK, CaptureStatus: "complete", ExtractorVersion: "advanced-research-adapter-v0.1"}
	_ = session
	for _, o := range obs {
		if o.Position < 1 || o.Position > topK {
			continue
		}
		p := domain.SurfaceCaptureItem{Rank: o.Position, ExternalItemID: o.ProductID, Title: o.ProductID, TaxonomyConfidence: .5}
		if md, ok, _ := s.universe.LatestLiveProductMetadata(o.ProductID); ok {
			p.Title = md.Title
			p.AuthorPublicName = md.AuthorDisplayName
			p.SourceURL = md.SourceURL
			p.SourceCategory = md.CategoryText
		}
		payload.Items = append(payload.Items, p)
	}
	return s.CreateSurfaceSnapshot(payload)
}

func parseAdapterTime(value string) time.Time {
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t
	}
	return time.Now().UTC()
}
