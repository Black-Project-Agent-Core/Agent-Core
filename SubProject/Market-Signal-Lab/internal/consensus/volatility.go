package consensus

import (
	"context"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"time"
)

type ItemVolatilityInput struct {
	EntityID               string
	ContextKey             string
	Ranks                  []*int
	TopK                   int
	ConsecutiveAppearances int
	EligibleSnapshots      int
	RBOToPrevious          float64
	SnapshotIDs            []string
	GeneratedAt            time.Time
}

type ClusterVolatilityInput struct {
	EntityType           string
	EntityID             string
	Shares               []float64
	ContextDisagreement  float64
	CrossTimePersistence float64
	SnapshotIDs          []string
	GeneratedAt          time.Time
}

func StabilityLabelForScore(score float64) domain.StabilityLabel {
	switch {
	case score < 25:
		return domain.StabilityStable
	case score < 45:
		return domain.StabilityVariable
	case score < 65:
		return domain.StabilityUnstable
	default:
		return domain.StabilityExtreme
	}
}

func BuildItemVolatilityWithEngine(ctx context.Context, engine analyticsengine.Engine, in ItemVolatilityInput) (domain.RankingVolatilitySnapshot, error) {
	if engine == nil {
		return domain.RankingVolatilitySnapshot{}, ErrAnalyticsEngineRequired
	}
	result, err := engine.ItemVolatility(ctx, analyticsengine.ItemVolatilityInput{
		Ranks:                  in.Ranks,
		TopK:                   in.TopK,
		ConsecutiveAppearances: in.ConsecutiveAppearances,
		EligibleSnapshots:      in.EligibleSnapshots,
		RBOToPrevious:          in.RBOToPrevious,
	})
	if err != nil {
		return domain.RankingVolatilitySnapshot{}, err
	}
	at := in.GeneratedAt
	if at.IsZero() {
		at = time.Now().UTC()
	}
	return domain.RankingVolatilitySnapshot{
		ID:                      domain.NewID(),
		EntityType:              "item",
		EntityID:                in.EntityID,
		ContextKey:              in.ContextKey,
		Score:                   result.Score,
		Label:                   result.Label,
		RankVariance:            result.RankVariance,
		AbsenceRate:             result.AbsenceRate,
		MedianAbsoluteDeviation: result.MedianAbsoluteDeviation,
		RBOPersistence:          result.RBOPersistence,
		ConsecutivePersistence:  result.ConsecutivePersistence,
		EligibleSnapshotIDs:     append([]string(nil), in.SnapshotIDs...),
		ModelVersion:            "ranking-volatility-v0.1",
		GeneratedAt:             at.Format(time.RFC3339),
	}, nil
}

func BuildClusterVolatilityWithEngine(ctx context.Context, engine analyticsengine.Engine, in ClusterVolatilityInput) (domain.RankingVolatilitySnapshot, error) {
	if engine == nil {
		return domain.RankingVolatilitySnapshot{}, ErrAnalyticsEngineRequired
	}
	result, err := engine.ClusterVolatility(ctx, analyticsengine.ClusterVolatilityInput{
		Shares:               in.Shares,
		ContextDisagreement:  in.ContextDisagreement,
		CrossTimePersistence: in.CrossTimePersistence,
	})
	if err != nil {
		return domain.RankingVolatilitySnapshot{}, err
	}
	at := in.GeneratedAt
	if at.IsZero() {
		at = time.Now().UTC()
	}
	entityType := in.EntityType
	if entityType == "" {
		entityType = "cluster"
	}
	return domain.RankingVolatilitySnapshot{
		ID:                  domain.NewID(),
		EntityType:          entityType,
		EntityID:            in.EntityID,
		Score:               result.Score,
		Label:               result.Label,
		RankVariance:        result.RankVariance,
		RBOPersistence:      result.RBOPersistence,
		EligibleSnapshotIDs: append([]string(nil), in.SnapshotIDs...),
		ModelVersion:        "ranking-volatility-v0.1",
		GeneratedAt:         at.Format(time.RFC3339),
	}, nil
}
