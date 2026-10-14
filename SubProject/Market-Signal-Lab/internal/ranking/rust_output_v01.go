package ranking

import (
	"errors"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"sort"
)

func directionFromCodeV01(code uint8) (domain.MarketDirection, error) {
	switch code {
	case 0:
		return domain.DirectionStrongFalling, nil
	case 1:
		return domain.DirectionFalling, nil
	case 2:
		return domain.DirectionNeutral, nil
	case 3:
		return domain.DirectionRising, nil
	case 4:
		return domain.DirectionStrongRising, nil
	default:
		return "", errors.New("invalid ranking direction code")
	}
}

func productMissingFromMaskV01(mask uint64) ([]string, error) {
	if mask&^uint64(0b11) != 0 {
		return nil, errors.New("invalid product ranking missing mask")
	}
	out := []string{}
	if mask&(1<<0) != 0 {
		out = append(out, "rank_velocity")
	}
	if mask&(1<<1) != 0 {
		out = append(out, "segmentation_fallback")
	}
	sort.Strings(out)
	return out, nil
}

func catalogMissingFromMaskV01(mask uint64) ([]string, error) {
	if mask&^uint64(0b1111) != 0 {
		return nil, errors.New("invalid catalog ranking missing mask")
	}
	out := []string{}
	if mask&(1<<0) != 0 {
		out = append(out, "previous_window_history")
	}
	if mask&(1<<1) != 0 {
		out = append(out, "research_session_coverage")
	}
	if mask&(1<<2) != 0 {
		out = append(out, "author_attribution")
	}
	if mask&(1<<3) != 0 {
		out = append(out, "external_trend")
	}
	sort.Strings(out)
	return out, nil
}

func AssembleProductSnapshotsV01(input BuildInput, normalized RustRankingNormalizationV01, result analyticsengine.ProductRankingV01Result) ([]domain.ProductSnapshot, error) {
	out := make([]domain.ProductSnapshot, 0, len(result.Rows))
	for _, row := range result.Rows {
		productID := normalized.ProductKeys.ByKey[row.ProductKey]
		if productID == "" {
			return nil, errors.New("unknown product result key")
		}
		direction, err := directionFromCodeV01(row.DirectionCode)
		if err != nil {
			return nil, err
		}
		missing, err := productMissingFromMaskV01(row.MissingMask)
		if err != nil {
			return nil, err
		}
		s := domain.ProductSnapshot{
			ProductID:                productID,
			CatalogID:                normalized.ResolvedCatalogByProduct[productID],
			Window:                   input.Window,
			ObservedAt:               input.Window.CurrentEnd,
			CurrentObservationCount:  int(row.CurrentObservationCount),
			PreviousObservationCount: int(row.PreviousObservationCount),
			QueryAppearances:         int(row.QueryAppearances),
			ApplicableQueries:        int(row.ApplicableQueries),
			SurfaceAppearances:       int(row.SurfaceAppearances),
			MedianPosition:           row.MedianPosition,
			PreviousMedianPosition:   row.PreviousMedianPosition,
			RankVelocity:             row.RankVelocity,
			RankVelocityScore:        row.RankVelocityScore,
			ExposureScore:            row.ExposureScore,
			FreshnessScore:           row.FreshnessScore,
			CrossQueryStrength:       row.CrossQueryStrength,
			RelativeStrength:         row.RelativeStrength,
			OpportunityScore:         row.OpportunityScore,
			Direction:                direction,
			ComparableHistory:        row.ComparableHistory,
			Confidence:               row.Confidence,
			Coverage:                 row.Coverage,
			Missing:                  missing,
			ModelVersion:             "product-snapshot-v0.2",
			ModelRefs: map[string]string{
				"product-exposure":    "product-exposure-v0.1",
				"product-opportunity": "product-opportunity-v0.1",
				"direction":           "direction-v0.1",
				"relative-strength":   "relative-strength-v0.1",
				"confidence":          "ranking-confidence-v0.1",
			},
			MarketMapRunID:  input.MarketMapRunID,
			IntegrityStatus: domain.IntegrityStatusNativeAlpha65,
		}
		s.ID = SnapshotID("product", s.ProductID, s.Window, s.ModelVersion)
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ProductID < out[j].ProductID })
	return out, nil
}

func AssembleCatalogSnapshotsV01(input BuildInput, normalized RustRankingNormalizationV01, result analyticsengine.CatalogRankingV01Result) ([]domain.CatalogSnapshot, error) {
	out := make([]domain.CatalogSnapshot, 0, len(result.Rows))
	for _, row := range result.Rows {
		catalogID := normalized.CatalogKeys.ByKey[row.CatalogKey]
		if catalogID == "" {
			return nil, errors.New("unknown catalog result key")
		}
		direction, err := directionFromCodeV01(row.DirectionCode)
		if err != nil {
			return nil, err
		}
		missing, err := catalogMissingFromMaskV01(row.MissingMask)
		if err != nil {
			return nil, err
		}
		s := domain.CatalogSnapshot{
			CatalogID:                 catalogID,
			Window:                    input.Window,
			ObservedAt:                input.Window.CurrentEnd,
			ObservedProducts:          int(row.ObservedProducts),
			ObservedAuthors:           int(row.ObservedAuthors),
			NewProducts:               int(row.NewProducts),
			PreviousNewProducts:       int(row.PreviousNewProducts),
			RisingProducts:            int(row.RisingProducts),
			NeutralProducts:           int(row.NeutralProducts),
			FallingProducts:           int(row.FallingProducts),
			ComparableProducts:        int(row.ComparableProducts),
			MedianRankVelocity:        row.MedianRankVelocity,
			ExposureBreadth:           row.ExposureBreadth,
			DemandMomentumPercent:     row.DemandMomentumPercent,
			DemandMomentumIndex:       row.DemandMomentumIndex,
			NewSupplyVelocityPercent:  row.NewSupplyVelocityPercent,
			NewSupplyVelocityIndex:    row.NewSupplyVelocityIndex,
			CompetitionAcceleration:   row.CompetitionAcceleration,
			CompetitionMomentumIndex:  row.CompetitionMomentumIndex,
			AuthorConcentration:       row.AuthorConcentration,
			AuthorAttributionCoverage: row.AuthorAttributionCoverage,
			FreshnessIndex:            row.FreshnessIndex,
			RelativeStrength:          row.RelativeStrength,
			SupplyGap:                 row.SupplyGap,
			DirectionIndex:            row.DirectionIndex,
			TrendScore:                row.TrendScore,
			OpportunityScore:          row.OpportunityScore,
			Direction:                 direction,
			Confidence:                row.Confidence,
			Coverage:                  row.Coverage,
			Missing:                   missing,
			ModelVersion:              "catalog-snapshot-v0.2",
			ModelRefs: map[string]string{
				"catalog-trend":        "catalog-trend-v0.1",
				"catalog-opportunity":  "catalog-opportunity-v0.1",
				"direction":            "direction-v0.1",
				"relative-strength":    "relative-strength-v0.1",
				"supply-gap":           "supply-gap-v0.1",
				"author-concentration": "author-concentration-v0.1",
				"confidence":           "ranking-confidence-v0.1",
			},
			MarketMapRunID:  input.MarketMapRunID,
			IntegrityStatus: domain.IntegrityStatusNativeAlpha65,
		}
		s.ID = SnapshotID("catalog", s.CatalogID, s.Window, s.ModelVersion)
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CatalogID < out[j].CatalogID })
	return out, nil
}
