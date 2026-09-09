package ranking

import (
	"errors"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"math"
	"sort"
)

type LocalKeyMapV01 struct {
	ByID  map[string]uint32
	ByKey map[uint32]string
}

type RustRankingNormalizationV01 struct {
	ProductInput             analyticsengine.ProductRankingV01Input
	ProductKeys              LocalKeyMapV01
	CatalogKeys              LocalKeyMapV01
	QueryKeys                LocalKeyMapV01
	AuthorKeys               LocalKeyMapV01
	PeerGroupKeys            LocalKeyMapV01
	ResolvedCatalogByProduct map[string]string
}

func deterministicLocalKeysV01(ids []string) LocalKeyMapV01 {
	set := map[string]struct{}{}
	for _, id := range ids {
		if id != "" {
			set[id] = struct{}{}
		}
	}
	sorted := make([]string, 0, len(set))
	for id := range set {
		sorted = append(sorted, id)
	}
	sort.Strings(sorted)
	out := LocalKeyMapV01{ByID: map[string]uint32{}, ByKey: map[uint32]string{}}
	for i, id := range sorted {
		key := uint32(i + 1)
		out.ByID[id] = key
		out.ByKey[key] = id
	}
	return out
}

func rankingWindowBucketV01(raw string, w domain.RankingWindow) analyticsengine.RankingWindowBucket {
	if InCurrentWindow(raw, w) {
		return analyticsengine.RankingWindowCurrent
	}
	if InPreviousWindow(raw, w) {
		return analyticsengine.RankingWindowPrevious
	}
	return analyticsengine.RankingWindowOutside
}

func surfaceCodeV01(surface domain.MarketSurface) (uint8, error) {
	switch surface {
	case domain.MarketSurfaceNew:
		return 1, nil
	case domain.MarketSurfaceRandomNew:
		return 2, nil
	case domain.MarketSurfacePopular:
		return 3, nil
	case domain.MarketSurfaceFeatured:
		return 4, nil
	case domain.MarketSurfaceSearch:
		return 5, nil
	case domain.MarketSurfaceCategory:
		return 6, nil
	case domain.MarketSurfaceSimilar:
		return 7, nil
	default:
		return 0, errors.New("unsupported market surface")
	}
}

func rawProductSessionCoveragesV01(dataset Dataset, h catalogHierarchy, product domain.ProductEntity, applicable map[string]struct{}, w domain.RankingWindow) []float64 {
	out := []float64{}
	for _, session := range dataset.Sessions {
		if session.Status == domain.ResearchSessionFailed || session.Status == domain.ResearchSessionCancelled || !sessionIntersectsCurrent(session, w) {
			continue
		}
		relevant := session.Scope != "" && h.within(session.Scope, product.CanonicalCatalogID)
		if !relevant {
			for _, queryID := range session.QueryIDs {
				if _, ok := applicable[queryID]; ok {
					relevant = true
					break
				}
			}
		}
		if relevant {
			out = append(out, session.CoverageEstimate)
		}
	}
	return out
}

func NormalizeProductRankingV01(input BuildInput) (RustRankingNormalizationV01, error) {
	if input.CatalogScopeID != "" && !catalogExists(input.Dataset.Catalogs, input.CatalogScopeID) {
		return RustRankingNormalizationV01{}, errors.New("unknown catalog scope")
	}
	hierarchy := newCatalogHierarchy(input.Dataset.Catalogs)
	segments := segmentationByObservation(input.Dataset)
	productByID := map[string]domain.ProductEntity{}
	for _, product := range input.Dataset.Products {
		productByID[product.ID] = product
	}

	resolvedCatalog := map[string]string{}
	fallbackByProduct := map[string]bool{}
	productIDs, catalogIDs, queryIDs, authorIDs := []string{}, []string{}, []string{}, []string{}
	selectedObs := []domain.ProductObservation{}
	for _, observation := range input.Dataset.Observations {
		product, ok := productByID[observation.ProductID]
		if !ok || observation.Position < 1 {
			continue
		}
		bucket := rankingWindowBucketV01(observation.ObservedAt, input.Window)
		if bucket == analyticsengine.RankingWindowOutside {
			continue
		}
		catalogID, fallback := observationCatalog(input.Dataset, observation, productByID, segments)
		if catalogID == "" || catalogIsExcluded(input.Dataset.Catalogs, catalogID) || !productInScope(hierarchy, input.CatalogScopeID, catalogID) {
			continue
		}
		product.CanonicalCatalogID = catalogID
		productByID[product.ID] = product
		resolvedCatalog[product.ID] = catalogID
		fallbackByProduct[product.ID] = fallbackByProduct[product.ID] || fallback
		productIDs = append(productIDs, product.ID)
		catalogIDs = append(catalogIDs, catalogID)
		queryIDs = append(queryIDs, observation.QueryID)
		authorIDs = append(authorIDs, observation.AuthorID)
		selectedObs = append(selectedObs, observation)
	}
	for _, query := range input.Dataset.Queries {
		queryIDs = append(queryIDs, query.ID)
	}

	// Catalog ranking is hierarchical: a direct product observation contributes
	// to every non-excluded ancestor that lies inside the requested scope.
	// Include those ancestors in the opaque key universe now so later catalog
	// normalization can project memberships/observations without inventing IDs.
	directCatalogIDs := append([]string(nil), catalogIDs...)
	for _, catalog := range input.Dataset.Catalogs {
		if catalogIsExcluded(input.Dataset.Catalogs, catalog.ID) {
			continue
		}
		if input.CatalogScopeID != "" && !hierarchy.within(input.CatalogScopeID, catalog.ID) {
			continue
		}
		for _, directID := range directCatalogIDs {
			if hierarchy.within(catalog.ID, directID) {
				catalogIDs = append(catalogIDs, catalog.ID)
				break
			}
		}
	}

	productKeys := deterministicLocalKeysV01(productIDs)
	catalogKeys := deterministicLocalKeysV01(catalogIDs)
	queryKeys := deterministicLocalKeysV01(queryIDs)
	authorKeys := deterministicLocalKeysV01(authorIDs)

	peerIDs := []string{}
	catalogByID := map[string]domain.CatalogNode{}
	for _, catalog := range input.Dataset.Catalogs {
		catalogByID[catalog.ID] = catalog
		peerIDs = append(peerIDs, catalog.Platform+"|"+catalog.ContentType+"|"+string(catalog.Level))
	}
	peerKeys := deterministicLocalKeysV01(peerIDs)

	entities := make([]analyticsengine.ProductRankingEntityV01, 0, len(productKeys.ByID))
	for _, productID := range productKeys.ByKey {
		product := productByID[productID]
		product.CanonicalCatalogID = resolvedCatalog[productID]
		applicable := applicableQueries(input.Dataset, hierarchy, product)
		applicableKeys := make([]uint32, 0, len(applicable))
		for queryID := range applicable {
			if key := queryKeys.ByID[queryID]; key != 0 {
				applicableKeys = append(applicableKeys, key)
			}
		}
		sort.Slice(applicableKeys, func(i, j int) bool { return applicableKeys[i] < applicableKeys[j] })
		entities = append(entities, analyticsengine.ProductRankingEntityV01{
			ProductKey: productKeys.ByID[productID], CatalogKey: catalogKeys.ByID[product.CanonicalCatalogID],
			FirstSeenBucket:      rankingWindowBucketV01(product.FirstSeenAt, input.Window),
			ApplicableQueryKeys:  applicableKeys,
			SessionCoverages:     rawProductSessionCoveragesV01(input.Dataset, hierarchy, product, applicable, input.Window),
			SegmentationFallback: input.MarketMapRunID != "" && fallbackByProduct[productID],
		})
	}
	sort.Slice(entities, func(i, j int) bool { return entities[i].ProductKey < entities[j].ProductKey })

	observations := make([]analyticsengine.ProductRankingObservationV01, 0, len(selectedObs))
	for _, observation := range selectedObs {
		if observation.Position > math.MaxInt32 {
			return RustRankingNormalizationV01{}, errors.New("observation position exceeds v0.1 wire range")
		}
		surfaceCode, err := surfaceCodeV01(observation.SurfaceType)
		if err != nil {
			return RustRankingNormalizationV01{}, err
		}
		observations = append(observations, analyticsengine.ProductRankingObservationV01{
			ProductKey: productKeys.ByID[observation.ProductID], WindowBucket: rankingWindowBucketV01(observation.ObservedAt, input.Window),
			QueryKey: queryKeys.ByID[observation.QueryID], SurfaceCode: surfaceCode,
			Position: int32(observation.Position), Reliability: observation.ObservationReliability,
		})
	}
	sort.SliceStable(observations, func(i, j int) bool {
		if observations[i].ProductKey != observations[j].ProductKey {
			return observations[i].ProductKey < observations[j].ProductKey
		}
		if observations[i].WindowBucket != observations[j].WindowBucket {
			return observations[i].WindowBucket < observations[j].WindowBucket
		}
		if observations[i].QueryKey != observations[j].QueryKey {
			return observations[i].QueryKey < observations[j].QueryKey
		}
		return observations[i].Position < observations[j].Position
	})

	return RustRankingNormalizationV01{
		ProductInput: analyticsengine.ProductRankingV01Input{Products: entities, Observations: observations},
		ProductKeys:  productKeys, CatalogKeys: catalogKeys, QueryKeys: queryKeys, AuthorKeys: authorKeys, PeerGroupKeys: peerKeys,
		ResolvedCatalogByProduct: resolvedCatalog,
	}, nil
}

func NormalizeCatalogRankingV01(input BuildInput, normalized RustRankingNormalizationV01, productResults []analyticsengine.ProductRankingV01ResultRow) (analyticsengine.CatalogRankingV01Input, error) {
	hierarchy := newCatalogHierarchy(input.Dataset.Catalogs)
	segments := segmentationByObservation(input.Dataset)
	productByID := map[string]domain.ProductEntity{}
	for _, product := range input.Dataset.Products {
		productByID[product.ID] = product
	}
	catalogByID := map[string]domain.CatalogNode{}
	for _, catalog := range input.Dataset.Catalogs {
		catalogByID[catalog.ID] = catalog
	}

	catalogs := []analyticsengine.CatalogRankingEntityV01{}
	for key, catalogID := range normalized.CatalogKeys.ByKey {
		catalog, ok := catalogByID[catalogID]
		if !ok {
			continue
		}
		peer := catalog.Platform + "|" + catalog.ContentType + "|" + string(catalog.Level)
		coverages := []float64{}
		for _, session := range input.Dataset.Sessions {
			if session.Status == domain.ResearchSessionFailed || session.Status == domain.ResearchSessionCancelled {
				continue
			}
			if relevantCatalogSession(input.Dataset, hierarchy, catalogID, session) && sessionIntersectsWindow(session, input.Window.CurrentStart, input.Window.CurrentEnd) {
				coverages = append(coverages, session.CoverageEstimate)
			}
		}
		catalogs = append(catalogs, analyticsengine.CatalogRankingEntityV01{
			CatalogKey: key, PeerGroupKey: normalized.PeerGroupKeys.ByID[peer],
			ApplicableQueryCount:     uint32(catalogApplicableQueryCount(input.Dataset, hierarchy, catalogID)),
			CurrentCompletedQueries:  uint32(completedQueryCount(input.Dataset, hierarchy, catalogID, input.Window.CurrentStart, input.Window.CurrentEnd)),
			PreviousCompletedQueries: uint32(completedQueryCount(input.Dataset, hierarchy, catalogID, input.Window.PreviousStart, input.Window.PreviousEnd)),
			CurrentSessionCoverages:  coverages,
		})
	}
	sort.Slice(catalogs, func(i, j int) bool { return catalogs[i].CatalogKey < catalogs[j].CatalogKey })

	observations := []analyticsengine.CatalogRankingObservationV01{}
	memberships := []analyticsengine.CatalogProductMembershipV01{}
	firstSeen := []analyticsengine.CatalogProductFirstSeenV01{}
	for productKey, productID := range normalized.ProductKeys.ByKey {
		directCatalogID := normalized.ResolvedCatalogByProduct[productID]
		for catalogKey, catalogID := range normalized.CatalogKeys.ByKey {
			if hierarchy.within(catalogID, directCatalogID) {
				memberships = append(memberships, analyticsengine.CatalogProductMembershipV01{CatalogKey: catalogKey, ProductKey: productKey})
			}
		}
		if product, ok := productByID[productID]; ok {
			firstSeen = append(firstSeen, analyticsengine.CatalogProductFirstSeenV01{ProductKey: productKey, FirstSeenBucket: rankingWindowBucketV01(product.FirstSeenAt, input.Window)})
		}
	}
	for _, observation := range input.Dataset.Observations {
		bucket := rankingWindowBucketV01(observation.ObservedAt, input.Window)
		if bucket == analyticsengine.RankingWindowOutside || observation.Position < 1 {
			continue
		}
		directCatalogID := observationCatalogID(observation, productByID, segments)
		productKey := normalized.ProductKeys.ByID[observation.ProductID]
		if productKey == 0 {
			continue
		}
		for catalogKey, catalogID := range normalized.CatalogKeys.ByKey {
			if !hierarchy.within(catalogID, directCatalogID) {
				continue
			}
			observations = append(observations, analyticsengine.CatalogRankingObservationV01{
				CatalogKey: catalogKey, ProductKey: productKey, AuthorKey: normalized.AuthorKeys.ByID[observation.AuthorID], HasAuthor: observation.AuthorID != "",
				QueryKey: normalized.QueryKeys.ByID[observation.QueryID], WindowBucket: bucket, Reliability: observation.ObservationReliability,
			})
		}
	}
	sort.Slice(memberships, func(i, j int) bool {
		if memberships[i].CatalogKey != memberships[j].CatalogKey {
			return memberships[i].CatalogKey < memberships[j].CatalogKey
		}
		return memberships[i].ProductKey < memberships[j].ProductKey
	})
	sort.Slice(firstSeen, func(i, j int) bool { return firstSeen[i].ProductKey < firstSeen[j].ProductKey })
	sort.SliceStable(observations, func(i, j int) bool {
		if observations[i].CatalogKey != observations[j].CatalogKey {
			return observations[i].CatalogKey < observations[j].CatalogKey
		}
		if observations[i].ProductKey != observations[j].ProductKey {
			return observations[i].ProductKey < observations[j].ProductKey
		}
		if observations[i].WindowBucket != observations[j].WindowBucket {
			return observations[i].WindowBucket < observations[j].WindowBucket
		}
		return observations[i].QueryKey < observations[j].QueryKey
	})
	return analyticsengine.CatalogRankingV01Input{Catalogs: catalogs, Observations: observations, Memberships: memberships, FirstSeen: firstSeen, ProductResults: productResults}, nil
}
