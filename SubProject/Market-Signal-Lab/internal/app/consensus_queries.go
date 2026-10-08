package app

import "marketsignallab/internal/domain"

func (s *Service) ConsensusContexts(f domain.ObservationContextFilter) ([]domain.ObservationContext, error) {
	return s.consensus.ObservationContexts(f)
}
func (s *Service) ConsensusSnapshots(f domain.SurfaceSnapshotFilter) ([]domain.SurfaceSnapshot, error) {
	return s.consensus.SurfaceSnapshots(f)
}
func (s *Service) ConsensusPairs(f domain.SnapshotPairFilter) ([]domain.SnapshotPair, error) {
	return s.consensus.SnapshotPairs(f)
}
func (s *Service) ConsensusSelection(f domain.SelectionProbabilityFilter) ([]domain.SelectionProbabilitySnapshot, error) {
	return s.consensus.SelectionProbabilitySnapshots(f)
}
func (s *Service) ConsensusVolatility(f domain.RankingVolatilityFilter) ([]domain.RankingVolatilitySnapshot, error) {
	return s.consensus.RankingVolatilitySnapshots(f)
}
func (s *Service) ConsensusProvenance(f domain.ConsensusScoreProvenanceFilter) ([]domain.ConsensusScoreProvenance, error) {
	return s.consensus.ConsensusScoreProvenances(f)
}
func (s *Service) ConsensusPairMetrics(f domain.PairMetricFilter) ([]domain.PairMetricSnapshot, error) {
	return s.consensus.PairMetricSnapshots(f)
}
