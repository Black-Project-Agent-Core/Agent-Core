package autopilot

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"

	"marketsignallab/internal/domain"
)

const (
	MarketTemperatureModelVersion         = "market-temperature-v0.1"
	ProductionPriorityModelVersion        = "production-priority-v0.1"
	SaturationAlertModelVersion           = "saturation-alert-v0.1"
	MarketAutopilotConfidenceModelVersion = "market-autopilot-confidence-v0.1"
)

type DirectionInput struct {
	Run             domain.MarketMapRun
	PriorRun        *domain.MarketMapRun
	CurrentCatalogs []domain.CatalogSnapshot
	PriorCatalogs   []domain.CatalogSnapshot
}

type ProductionInsightInput struct {
	RunID      string
	Coverage   float64
	Confidence float64
	Catalogs   []domain.CatalogSnapshot
	Clusters   []domain.ProductDirectionCluster
}

type SaturationInput struct {
	RunID    string
	Catalogs []domain.CatalogSnapshot
}

func stableInsightID(prefix string, parts ...string) string {
	data := prefix
	for _, part := range parts {
		data += "|" + part
	}
	sum := sha256.Sum256([]byte(data))
	return prefix + "-" + hex.EncodeToString(sum[:8])
}

func clampScore(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return round1(v)
}

func weightedCatalogTemperature(rows []domain.CatalogSnapshot) float64 {
	if len(rows) == 0 {
		return 0
	}
	total, weight := 0.0, 0.0
	for _, row := range rows {
		w := float64(row.ObservedProducts)
		if w < 1 {
			w = 1
		}
		value := row.TrendScore*.65 + row.OpportunityScore*.35
		total += value * w
		weight += w
	}
	if weight == 0 {
		return 0
	}
	return clampScore(total / weight)
}

func directionFromDelta(delta float64) string {
	switch {
	case delta >= 8:
		return "strong_rising"
	case delta >= 2:
		return "rising"
	case delta <= -8:
		return "strong_falling"
	case delta <= -2:
		return "falling"
	default:
		return "neutral"
	}
}

func BuildMarketDirection(in DirectionInput) domain.MarketDirectionSnapshot {
	current := weightedCatalogTemperature(in.CurrentCatalogs)
	out := domain.MarketDirectionSnapshot{
		ID: stableInsightID("direction", in.Run.ID, in.Run.CompletedAt), RunID: in.Run.ID,
		AsOf: in.Run.CompletedAt, Temperature: current, Direction: "composition_only", Status: "composition_only",
		CompositionOnly: true, Coverage: clampScore(in.Run.Coverage), Confidence: clampScore(in.Run.Confidence * .75),
		ModelVersion: MarketTemperatureModelVersion,
		ReasonCodes:  []string{"CURRENT_COMPOSITION_ONLY", "COMPARABLE_HISTORY_REQUIRED"},
	}
	priorCompatible := in.PriorRun != nil && in.PriorRun.ID != "" && in.PriorRun.ID != in.Run.ID &&
		in.PriorRun.Status == domain.MarketMapRunCompleted && in.PriorRun.CompatibilityKey == in.Run.CompatibilityKey &&
		len(in.PriorCatalogs) > 0
	if !priorCompatible {
		return out
	}
	priorTemp := weightedCatalogTemperature(in.PriorCatalogs)
	delta := current - priorTemp
	out.PriorRunID = in.PriorRun.ID
	out.Direction = directionFromDelta(delta)
	out.Status = out.Direction
	out.CompositionOnly = false
	out.Confidence = clampScore((in.Run.Confidence*.55 + in.PriorRun.Confidence*.25 + minScore(in.Run.Coverage, in.PriorRun.Coverage)*.20))
	out.ReasonCodes = []string{"COMPATIBLE_PRIOR_MAP", "MARKET_TEMPERATURE_DELTA"}
	return out
}

func minScore(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func insightForCatalog(in ProductionInsightInput, row domain.CatalogSnapshot) domain.ProductionInsight {
	coverage := row.Coverage
	if coverage <= 0 {
		coverage = in.Coverage
	}
	confidence := row.Confidence
	if confidence <= 0 {
		confidence = in.Confidence
	}
	priority := clampScore(row.OpportunityScore*.55 + row.TrendScore*.30 + row.ExposureBreadth*.15)
	code, rec := "WATCH", "watch"
	reasons := []string{"CATALOG_TREND", "CATALOG_OPPORTUNITY"}
	risks := []string{}
	if coverage < 50 {
		code, rec = "INSUFFICIENT_EVIDENCE", "insufficient_evidence"
		if priority > 49 {
			priority = 49
		}
		risks = append(risks, "LOW_COVERAGE")
	} else if row.TrendScore >= 70 && row.OpportunityScore >= 70 && row.ExposureBreadth >= 50 && row.NewSupplyVelocityIndex < 70 && row.CompetitionMomentumIndex < 70 {
		code, rec = "RISING_WITH_OPEN_SPACE", "produce_candidate"
		reasons = append(reasons, "HEALTHY_BREADTH", "SUPPLY_NOT_OVERTAKING_MOMENTUM", "COMPETITION_MANAGEABLE")
	} else if row.OpportunityScore >= 70 {
		code, rec = "RESEARCH_NOW", "research_now"
	}
	return domain.ProductionInsight{ID: stableInsightID("insight", in.RunID, "catalog", row.CatalogID), RunID: in.RunID, CatalogID: row.CatalogID, EntityType: "catalog", EntityID: row.CatalogID, Code: code, Recommendation: rec, Priority: priority, Score: priority, Trend: row.TrendScore, Opportunity: row.OpportunityScore, Coverage: clampScore(coverage), Confidence: clampScore(confidence), ReasonCodes: reasons, RiskCodes: risks, ModelVersion: ProductionPriorityModelVersion}
}

func insightForCluster(in ProductionInsightInput, row domain.ProductDirectionCluster) domain.ProductionInsight {
	coverage := row.Coverage
	if coverage <= 0 {
		coverage = in.Coverage
	}
	confidence := row.Confidence
	if confidence <= 0 {
		confidence = in.Confidence
	}
	priority := clampScore(row.Opportunity*.70 + row.Freshness*.20 + confidence*.10)
	code, rec := "WATCH", "watch"
	reasons := []string{"PRODUCT_DIRECTION_EVIDENCE", "CLUSTER_OPPORTUNITY"}
	risks := []string{}
	if coverage < 50 {
		code, rec = "INSUFFICIENT_EVIDENCE", "insufficient_evidence"
		if priority > 49 {
			priority = 49
		}
		risks = append(risks, "LOW_COVERAGE")
	} else if row.Opportunity >= 75 && confidence >= 65 && !row.NeedsReview {
		code, rec = "PRODUCE_CANDIDATE", "produce_candidate"
		reasons = append(reasons, "MULTI_PRODUCT_CLUSTER", "CONFIDENCE_GATE_PASSED")
	} else if row.Opportunity >= 65 {
		code, rec = "RESEARCH_NOW", "research_now"
	}
	return domain.ProductionInsight{ID: stableInsightID("insight", in.RunID, "cluster", row.ID), RunID: in.RunID, CatalogID: row.CatalogID, ClusterID: row.ID, EntityType: "product_direction", EntityID: row.ID, Code: code, Recommendation: rec, Priority: priority, Score: priority, Opportunity: row.Opportunity, Coverage: clampScore(coverage), Confidence: clampScore(confidence), ReasonCodes: reasons, RiskCodes: risks, ModelVersion: ProductionPriorityModelVersion}
}

func BuildProductionInsights(in ProductionInsightInput) []domain.ProductionInsight {
	out := make([]domain.ProductionInsight, 0, len(in.Catalogs)+len(in.Clusters))
	for _, row := range in.Catalogs {
		out = append(out, insightForCatalog(in, row))
	}
	for _, row := range in.Clusters {
		out = append(out, insightForCluster(in, row))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority == out[j].Priority {
			return out[i].ID < out[j].ID
		}
		return out[i].Priority > out[j].Priority
	})
	return out
}

func BuildSaturationAlerts(in SaturationInput) []domain.SaturationAlert {
	out := []domain.SaturationAlert{}
	for _, row := range in.Catalogs {
		if row.TrendScore >= 75 && row.OpportunityScore < 65 && (row.NewSupplyVelocityIndex >= 75 || row.CompetitionMomentumIndex >= 75) {
			out = append(out, domain.SaturationAlert{ID: stableInsightID("alert", in.RunID, row.CatalogID, "crowded"), RunID: in.RunID, CatalogID: row.CatalogID, EntityType: "catalog", EntityID: row.CatalogID, Code: "HOT_BUT_CROWDED", Severity: "warning", Trend: row.TrendScore, Supply: row.NewSupplyVelocityIndex, Competition: row.CompetitionMomentumIndex, Breadth: row.ExposureBreadth, ReasonCodes: []string{"HIGH_TREND", "SUPPLY_OR_COMPETITION_ACCELERATING", "OPPORTUNITY_GAP_NARROW"}, ModelVersion: SaturationAlertModelVersion})
		}
		if row.TrendScore >= 75 && row.ExposureBreadth < 35 {
			out = append(out, domain.SaturationAlert{ID: stableInsightID("alert", in.RunID, row.CatalogID, "breadth"), RunID: in.RunID, CatalogID: row.CatalogID, EntityType: "catalog", EntityID: row.CatalogID, Code: "LOW_BREADTH_HYPE", Severity: "warning", Trend: row.TrendScore, Supply: row.NewSupplyVelocityIndex, Competition: row.CompetitionMomentumIndex, Breadth: row.ExposureBreadth, ReasonCodes: []string{"HIGH_TREND", "LOW_PRODUCT_PARTICIPATION"}, ModelVersion: SaturationAlertModelVersion})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Severity == out[j].Severity {
			return out[i].ID < out[j].ID
		}
		return out[i].Severity > out[j].Severity
	})
	return out
}
