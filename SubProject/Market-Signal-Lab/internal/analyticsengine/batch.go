package analyticsengine

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type BatchOperation struct {
	SlotID      uint32
	OperationID V2OperationID
	SchemaID    V2SchemaID
	Input       any
}

type BatchOperationResult struct {
	SlotID         uint32
	OperationID    V2OperationID
	SchemaID       V2SchemaID
	Status         V2OperationStatus
	Payload        []byte
	Err            error
	DurationMicros uint64
}

type AnalyticsBatch struct{ Operations []BatchOperation }
type AnalyticsBatchResult struct{ Operations []BatchOperationResult }

type BatchExecutor interface {
	ExecuteAnalyticsBatch(context.Context, AnalyticsBatch) (AnalyticsBatchResult, error)
}

type V2TransportMetrics struct {
	QueueDepth               int
	InFlight                 bool
	LastFrameBytes           uint64
	LastBatchOperationCount  int
	LastQueueWaitMicros      uint64
	LastEncodeMicros         uint64
	LastRoundTripMicros      uint64
	LastWorkerComputeMicros  uint64
	LastDecodeMicros         uint64
	WorkerRestartCount       uint64
	LastSuccessfulResponseAt time.Time
}

func validateAnalyticsBatch(batch AnalyticsBatch) error {
	if len(batch.Operations) == 0 || len(batch.Operations) > int(V2MaxOperations) {
		return errors.New("analytics v2 batch operation count is invalid")
	}
	seen := make(map[uint32]struct{}, len(batch.Operations))
	for _, op := range batch.Operations {
		if op.SlotID == 0 {
			return errors.New("analytics v2 batch slot id must be non-zero")
		}
		if _, ok := seen[op.SlotID]; ok {
			return errors.New("analytics v2 batch slot id must be unique")
		}
		seen[op.SlotID] = struct{}{}
		if op.SchemaID != 1 {
			return fmt.Errorf("analytics v2 unsupported schema operation=%d schema=%d", op.OperationID, op.SchemaID)
		}
	}
	return nil
}

func encodeAnalyticsBatchV2(requestID uint64, batch AnalyticsBatch, dst []byte) ([]byte, error) {
	if err := validateAnalyticsBatch(batch); err != nil {
		return nil, err
	}
	encoded := make([]V2EncodedOperation, len(batch.Operations))
	for i, op := range batch.Operations {
		var payload []byte
		var err error
		switch op.OperationID {
		case V2OpDistributionSimilarity:
			in, ok := op.Input.(DistributionSimilarityInput)
			if !ok {
				return nil, errors.New("analytics v2 distribution input type mismatch")
			}
			payload, err = EncodeDistributionSimilarityV2(in, nil)
		case V2OpItemVolatility:
			in, ok := op.Input.(ItemVolatilityInput)
			if !ok {
				return nil, errors.New("analytics v2 item volatility input type mismatch")
			}
			payload, err = EncodeItemVolatilityV2(in, nil)
		case V2OpClusterVolatility:
			in, ok := op.Input.(ClusterVolatilityInput)
			if !ok {
				return nil, errors.New("analytics v2 cluster volatility input type mismatch")
			}
			payload, err = EncodeClusterVolatilityV2(in, nil)
		case V2OpSelectionProbability:
			in, ok := op.Input.(SelectionProbabilityInput)
			if !ok {
				return nil, errors.New("analytics v2 selection input type mismatch")
			}
			payload, err = EncodeSelectionProbabilityV2(in, nil)
		case V2OpProductRankingV01:
			in, ok := op.Input.(ProductRankingV01Input)
			if !ok {
				return nil, errors.New("analytics v2 product ranking input type mismatch")
			}
			payload, err = EncodeProductRankingV01(in, nil)
		case V2OpCatalogRankingV01:
			in, ok := op.Input.(CatalogRankingV01Input)
			if !ok {
				return nil, errors.New("analytics v2 catalog ranking input type mismatch")
			}
			payload, err = EncodeCatalogRankingV01(in, nil)
		case V2OpStructuralIndexV01:
			in, ok := op.Input.(StructuralIndexV01Input)
			if !ok {
				return nil, errors.New("analytics v2 structural index input type mismatch")
			}
			payload, err = EncodeStructuralIndexV01(in, nil)
		case V2OpStructuralDirectionV01:
			in, ok := op.Input.(StructuralDirectionV01Input)
			if !ok {
				return nil, errors.New("analytics v2 structural direction input type mismatch")
			}
			payload, err = EncodeStructuralDirectionV01(in, nil)
		case V2OpCompetitionAccelerationV02:
			in, ok := op.Input.(CompetitionAccelerationV02Input)
			if !ok {
				return nil, errors.New("analytics v2 competition acceleration v0.2 input type mismatch")
			}
			payload, err = EncodeCompetitionAccelerationV02(in, nil)
		case V2OpDirectionalMomentumV02:
			in, ok := op.Input.(DirectionalMomentumV02Input)
			if !ok {
				return nil, errors.New("analytics v2 directional momentum v0.2 input type mismatch")
			}
			payload, err = EncodeDirectionalMomentumV02(in, nil)
		case V2OpPeerRelativeRankV02:
			in, ok := op.Input.(PeerRelativeRankV02Input)
			if !ok {
				return nil, errors.New("analytics v2 peer relative rank v0.2 input type mismatch")
			}
			payload, err = EncodePeerRelativeRankV02(in, nil)
		case V2OpAuthorConcentrationChangeV02:
			in, ok := op.Input.(AuthorConcentrationChangeV02Input)
			if !ok {
				return nil, errors.New("analytics v2 author concentration change v0.2 input type mismatch")
			}
			payload, err = EncodeAuthorConcentrationChangeV02(in, nil)
		case V2OpMovementDivergenceV02:
			in, ok := op.Input.(MovementDivergenceV02Input)
			if !ok {
				return nil, errors.New("analytics v2 movement divergence v0.2 input type mismatch")
			}
			payload, err = EncodeMovementDivergenceV02(in, nil)
		default:
			return nil, fmt.Errorf("analytics v2 unsupported operation=%d", op.OperationID)
		}
		if err != nil {
			return nil, err
		}
		encoded[i] = V2EncodedOperation{Descriptor: V2OperationDescriptor{SlotID: op.SlotID, OperationID: op.OperationID, SchemaID: op.SchemaID}, Payload: payload}
	}
	return EncodeV2AnalyticsRequest(requestID, encoded, dst)
}
