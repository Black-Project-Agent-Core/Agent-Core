package repository

import "marketsignallab/internal/domain"

type AutopilotRepository interface {
	SaveMarketMapPlan(domain.MarketMapPlan) error
	MarketMapPlans() ([]domain.MarketMapPlan, error)
	MarketMapPlanByID(string) (domain.MarketMapPlan, bool, error)
	AppendMarketMapRun(domain.MarketMapRun) error
	MarketMapRuns() ([]domain.MarketMapRun, error)
	MarketMapRunByID(string) (domain.MarketMapRun, bool, error)
	LatestCompletedMarketMapRun(compatibilityKey string) (domain.MarketMapRun, bool, error)
	LatestCompletedMarketMapRunExcluding(compatibilityKey, excludeRunID string) (domain.MarketMapRun, bool, error)
	AppendMarketSurfaceObservation(domain.MarketSurfaceObservation) error
	MarketSurfaceObservations(runID string) ([]domain.MarketSurfaceObservation, error)
	AppendMarketDirectionSnapshot(domain.MarketDirectionSnapshot) error
	MarketDirectionSnapshots(runID string) ([]domain.MarketDirectionSnapshot, error)
	AppendProductDirectionCluster(domain.ProductDirectionCluster) error
	AppendProductDirectionClusters([]domain.ProductDirectionCluster) error
	ProductDirectionClusters(runID string) ([]domain.ProductDirectionCluster, error)
	AppendProductionInsight(domain.ProductionInsight) error
	AppendProductionInsights([]domain.ProductionInsight) error
	ProductionInsights(runID string) ([]domain.ProductionInsight, error)
	AppendSaturationAlert(domain.SaturationAlert) error
	AppendSaturationAlerts([]domain.SaturationAlert) error
	SaturationAlerts(runID string) ([]domain.SaturationAlert, error)
	AppendAdvancedResearchSeed(domain.AdvancedResearchSeed) error
	AdvancedResearchSeeds(runID string) ([]domain.AdvancedResearchSeed, error)
	AppendClassificationReview(domain.ClassificationReview) error
	AppendClassificationReviews([]domain.ClassificationReview) error
	ClassificationReviews(runID string) ([]domain.ClassificationReview, error)
}
