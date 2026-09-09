package repository

import "marketsignallab/internal/domain"

type ConsensusRepository interface {
	AppendObservationContext(domain.ObservationContext) error
	ObservationContexts(domain.ObservationContextFilter) ([]domain.ObservationContext, error)
	AppendSurfaceSnapshot(domain.SurfaceSnapshot) error
	SurfaceSnapshots(domain.SurfaceSnapshotFilter) ([]domain.SurfaceSnapshot, error)
	AppendSurfaceSnapshotItem(domain.SurfaceSnapshotItem) error
	SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter) ([]domain.SurfaceSnapshotItem, error)
	AppendCaptureBatch(domain.CaptureBatch) error
	CaptureBatches(domain.CaptureBatchFilter) ([]domain.CaptureBatch, error)
	AppendSnapshotPair(domain.SnapshotPair) error
	SnapshotPairs(domain.SnapshotPairFilter) ([]domain.SnapshotPair, error)
	AppendPairMetricSnapshot(domain.PairMetricSnapshot) error
	PairMetricSnapshots(domain.PairMetricFilter) ([]domain.PairMetricSnapshot, error)
	AppendMultiContextConsensusSnapshot(domain.MultiContextConsensusSnapshot) error
	MultiContextConsensusSnapshots(domain.MultiContextConsensusFilter) ([]domain.MultiContextConsensusSnapshot, error)
	AppendMarketAmbiguitySnapshot(domain.MarketAmbiguitySnapshot) error
	MarketAmbiguitySnapshots(domain.MarketAmbiguityFilter) ([]domain.MarketAmbiguitySnapshot, error)
	AppendSelectionProbabilitySnapshot(domain.SelectionProbabilitySnapshot) error
	SelectionProbabilitySnapshots(domain.SelectionProbabilityFilter) ([]domain.SelectionProbabilitySnapshot, error)
	AppendRankingVolatilitySnapshot(domain.RankingVolatilitySnapshot) error
	RankingVolatilitySnapshots(domain.RankingVolatilityFilter) ([]domain.RankingVolatilitySnapshot, error)
	AppendContextHealthSnapshot(domain.ContextHealthSnapshot) error
	ContextHealthSnapshots(domain.ContextHealthFilter) ([]domain.ContextHealthSnapshot, error)
	AppendConsensusScoreProvenance(domain.ConsensusScoreProvenance) error
	ConsensusScoreProvenances(domain.ConsensusScoreProvenanceFilter) ([]domain.ConsensusScoreProvenance, error)
	AppendCaptureImportAudit(domain.CaptureImportAudit) error
	CaptureImportAudits(domain.CaptureImportAuditFilter) ([]domain.CaptureImportAudit, error)
}
