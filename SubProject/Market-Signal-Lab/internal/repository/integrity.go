package repository

import "marketsignallab/internal/domain"

type IntegrityRepository interface {
	AppendObservationSegmentation(domain.ObservationSegmentation) error
	ObservationSegmentations(domain.ObservationSegmentationFilter) ([]domain.ObservationSegmentation, error)
	AppendMarketMapTargetResult(domain.MarketMapTargetResult) error
	MarketMapTargetResults(runID string) ([]domain.MarketMapTargetResult, error)
	AppendSampleAudit(domain.SampleAudit) error
	SampleAudits(domain.SampleAuditFilter) ([]domain.SampleAudit, error)
	LatestSampleAudit(runID string) (domain.SampleAudit, bool, error)
	AppendDataQualityAssessment(domain.DataQualityAssessment) error
	AppendDataQualityAssessments([]domain.DataQualityAssessment) error
	DataQualityAssessments(domain.DataQualityFilter) ([]domain.DataQualityAssessment, error)
	AppendMarketIndexSnapshot(domain.MarketIndexSnapshot) error
	AppendMarketIndexSnapshots([]domain.MarketIndexSnapshot) error
	MarketIndexSnapshots(domain.MarketIndexFilter) ([]domain.MarketIndexSnapshot, error)
	LatestMarketIndexSnapshot(domain.MarketIndexFilter) (domain.MarketIndexSnapshot, bool, error)
	AppendScoreProvenance(domain.ScoreProvenance) error
	AppendScoreProvenances([]domain.ScoreProvenance) error
	ScoreProvenances(domain.ScoreProvenanceFilter) ([]domain.ScoreProvenance, error)
	ScoreProvenanceByID(string) (domain.ScoreProvenance, bool, error)
	AppendLegacyClassificationReview(domain.LegacyClassificationReview) error
	LegacyClassificationReviews(domain.LegacyClassificationReviewFilter) ([]domain.LegacyClassificationReview, error)
}
