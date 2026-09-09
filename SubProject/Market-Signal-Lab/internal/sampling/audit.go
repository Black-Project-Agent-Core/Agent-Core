package sampling

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
	"sort"
	"strings"
)

type AuditObservation struct {
	ProductID, AuthorID, Site, ContentType, CatalogID string
	Surface                                           domain.MarketSurface
	Reliability, TaxonomyConfidence                   float64
}

type AuditInput struct {
	RunID, PlannerVersion, SamplingSchemaVersion, TaxonomyVersion string
	Targets                                                       []domain.MarketMapSurfaceTarget
	TargetResults                                                 []domain.MarketMapTargetResult
	Observations                                                  []AuditObservation
	TargetSample, ComparableRuns                                  int
	GeneratedAt                                                   string
}

func distribution(values []string) []domain.DistributionShare {
	counts := map[string]int{}
	total := 0
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			counts[value]++
			total++
		}
	}
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if total == 0 {
		return nil
	}
	out := make([]domain.DistributionShare, 0, len(keys))
	for _, key := range keys {
		out = append(out, domain.DistributionShare{Key: key, Count: counts[key], Share: roundAudit1(100 * float64(counts[key]) / float64(total))})
	}
	return out
}

func balanceScore(rows []domain.DistributionShare) float64 {
	if len(rows) < 2 {
		return 0
	}
	hhi := 0.0
	for _, row := range rows {
		share := row.Share / 100
		hhi += share * share
	}
	minimum := 1 / float64(len(rows))
	return roundAudit1(100 * math.Max(0, (1-hhi)/(1-minimum)))
}

func roundAudit1(value float64) float64 { return math.Round(value*10) / 10 }
func pctAudit(num, den int) float64 {
	if den <= 0 {
		return 0
	}
	return roundAudit1(100 * float64(num) / float64(den))
}
func averageAudit(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return roundAudit1(total / float64(len(values)))
}
func maxShare(rows []domain.DistributionShare) float64 {
	max := 0.0
	for _, row := range rows {
		if row.Share > max {
			max = row.Share
		}
	}
	return max
}

func BuildSampleAudit(in AuditInput) (domain.SampleAudit, error) {
	if strings.TrimSpace(in.RunID) == "" {
		return domain.SampleAudit{}, errors.New("run ID is required")
	}
	if in.GeneratedAt == "" {
		return domain.SampleAudit{}, errors.New("generated timestamp is required")
	}

	sites, contentTypes, catalogs, surfaces := []string{}, []string{}, []string{}, []string{}
	uniqueProducts := map[string]struct{}{}
	authorCount, taxonomyCount := 0, 0
	taxonomyValues, reliabilityValues := []float64{}, []float64{}
	observedSurfaceSet := map[domain.MarketSurface]struct{}{}
	for _, obs := range in.Observations {
		sites = append(sites, obs.Site)
		contentTypes = append(contentTypes, obs.ContentType)
		catalogs = append(catalogs, obs.CatalogID)
		if obs.Surface != "" {
			surfaces = append(surfaces, string(obs.Surface))
			observedSurfaceSet[obs.Surface] = struct{}{}
		}
		if obs.ProductID != "" {
			uniqueProducts[obs.ProductID] = struct{}{}
		}
		if obs.AuthorID != "" {
			authorCount++
		}
		if obs.ContentType != "" {
			taxonomyCount++
			taxonomyValues = append(taxonomyValues, obs.TaxonomyConfidence)
		}
		reliabilityValues = append(reliabilityValues, obs.Reliability*100)
	}

	siteDistribution := distribution(sites)
	contentTypeDistribution := distribution(contentTypes)
	catalogDistribution := distribution(catalogs)
	surfaceDistribution := distribution(surfaces)
	siteBalance := balanceScore(siteDistribution)
	balance := siteBalance
	if len(catalogDistribution) >= 2 {
		catalogBalance := balanceScore(catalogDistribution)
		if balance == 0 || catalogBalance < balance {
			balance = catalogBalance
		}
	}

	resultByTarget := map[string]domain.MarketMapTargetResult{}
	completed := 0
	for _, row := range in.TargetResults {
		resultByTarget[row.TargetID] = row
		if row.Status == domain.MarketMapTargetCompleted {
			completed++
		}
	}
	plannedSurfaceSet := map[domain.MarketSurface]struct{}{}
	targetSample := 0
	highPriorityComplete := true
	strata := make([]domain.StratumAudit, 0, len(in.Targets))
	reasonCodes := []string{}
	for _, target := range in.Targets {
		plannedSurfaceSet[target.Surface] = struct{}{}
		targetSample += target.TargetSample
		result, ok := resultByTarget[target.ID]
		isComplete := ok && result.Status == domain.MarketMapTargetCompleted
		if target.HighPriority && !isComplete {
			highPriorityComplete = false
		}
		if ok && result.FailureCode != "" {
			reasonCodes = append(reasonCodes, result.FailureCode)
		}
		strata = append(strata, domain.StratumAudit{
			Key: target.StratumKey, TargetID: target.ID, Site: target.Site, ContentType: target.ContentType,
			CatalogID: target.CatalogLevelKey, Surface: target.Surface, TargetSample: target.TargetSample,
			ObservedItems: result.ObservedItems, UniqueProducts: result.UniqueProducts,
			RequestsAllowed: target.RequestAllowance, RequestsUsed: result.RequestsUsed,
			Completed: isComplete, HighPriority: target.HighPriority, Reliability: 90, FailureCode: result.FailureCode,
		})
	}
	if len(in.Targets) == 0 {
		highPriorityComplete = false
		completed = 0
		targetSample = in.TargetSample
	}
	if targetSample == 0 {
		targetSample = in.TargetSample
	}
	if targetSample == 0 {
		targetSample = len(in.Observations)
	}

	totalObservations := len(in.Observations)
	uniqueCount := len(uniqueProducts)
	uniqueRatio := pctAudit(uniqueCount, totalObservations)
	plannedSurfaceCount := len(plannedSurfaceSet)
	if plannedSurfaceCount == 0 {
		plannedSurfaceCount = len(observedSurfaceSet)
	}
	surfaceDiversity := pctAudit(len(observedSurfaceSet), plannedSurfaceCount)
	if surfaceDiversity > 100 {
		surfaceDiversity = 100
	}
	completion := pctAudit(completed, len(in.Targets))
	if len(in.Targets) == 0 && len(in.TargetResults) > 0 {
		completion = pctAudit(completed, len(in.TargetResults))
	}

	return domain.SampleAudit{
		ID: domain.NewID(), RunID: in.RunID, PlannerVersion: in.PlannerVersion,
		SamplingSchemaVersion: in.SamplingSchemaVersion, TaxonomyVersion: in.TaxonomyVersion,
		TargetStrata: len(in.Targets), CompletedStrata: completed, TargetSample: targetSample,
		UniqueProducts: uniqueCount, TotalObservations: totalObservations,
		StratumCompletionRate: completion,
		SampleSizeAdequacy:    roundAudit1(math.Min(100, 100*float64(uniqueCount)/float64(maxAuditInt(1, targetSample)))),
		SampleBalanceScore:    balance, UniqueProductRatio: uniqueRatio,
		DuplicateRate:      roundAudit1(math.Max(0, 100-uniqueRatio)),
		TaxonomyCoverage:   pctAudit(taxonomyCount, totalObservations),
		TaxonomyConfidence: averageAudit(taxonomyValues), AuthorCoverage: pctAudit(authorCount, totalObservations),
		SourceReliability: averageAudit(reliabilityValues), SurfaceDiversityScore: surfaceDiversity,
		DominantSiteShare: maxShare(siteDistribution), DominantCatalogShare: maxShare(catalogDistribution),
		HighPriorityComplete: highPriorityComplete, SiteDistribution: siteDistribution,
		ContentTypeDistribution: contentTypeDistribution, CatalogDistribution: catalogDistribution,
		SurfaceDistribution: surfaceDistribution, Strata: strata, ReasonCodes: uniqueSortedAudit(reasonCodes),
		GeneratedAt: in.GeneratedAt,
	}, nil
}

func maxAuditInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
func uniqueSortedAudit(values []string) []string {
	set := map[string]struct{}{}
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			set[value] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for value := range set {
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
