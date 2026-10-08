package analyticsengine

import (
	"context"
	"errors"
	"fmt"
)

const c3V02ClientSlotID uint32 = 1

func ExecuteCompetitionAccelerationV02(ctx context.Context, executor BatchExecutor, input CompetitionAccelerationV02Input) (CompetitionAccelerationV02Result, error) {
	payload, err := executeC3V02(ctx, executor, V2OpCompetitionAccelerationV02, input)
	if err != nil {
		return CompetitionAccelerationV02Result{}, err
	}
	return DecodeCompetitionAccelerationV02Result(payload)
}

func ExecuteDirectionalMomentumV02(ctx context.Context, executor BatchExecutor, input DirectionalMomentumV02Input) (DirectionalMomentumV02Result, error) {
	payload, err := executeC3V02(ctx, executor, V2OpDirectionalMomentumV02, input)
	if err != nil {
		return DirectionalMomentumV02Result{}, err
	}
	return DecodeDirectionalMomentumV02Result(payload)
}

func ExecutePeerRelativeRankV02(ctx context.Context, executor BatchExecutor, input PeerRelativeRankV02Input) (PeerRelativeRankV02Result, error) {
	payload, err := executeC3V02(ctx, executor, V2OpPeerRelativeRankV02, input)
	if err != nil {
		return PeerRelativeRankV02Result{}, err
	}
	return DecodePeerRelativeRankV02Result(payload)
}

func ExecuteAuthorConcentrationChangeV02(ctx context.Context, executor BatchExecutor, input AuthorConcentrationChangeV02Input) (AuthorConcentrationChangeV02Result, error) {
	payload, err := executeC3V02(ctx, executor, V2OpAuthorConcentrationChangeV02, input)
	if err != nil {
		return AuthorConcentrationChangeV02Result{}, err
	}
	return DecodeAuthorConcentrationChangeV02Result(payload)
}

func ExecuteMovementDivergenceV02(ctx context.Context, executor BatchExecutor, input MovementDivergenceV02Input) (MovementDivergenceV02Result, error) {
	payload, err := executeC3V02(ctx, executor, V2OpMovementDivergenceV02, input)
	if err != nil {
		return MovementDivergenceV02Result{}, err
	}
	return DecodeMovementDivergenceV02Result(payload)
}

func executeC3V02(ctx context.Context, executor BatchExecutor, operation V2OperationID, input any) ([]byte, error) {
	if executor == nil {
		return nil, errors.New("C3.1 v0.2 analytics executor is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	batchResult, err := executor.ExecuteAnalyticsBatch(ctx, AnalyticsBatch{Operations: []BatchOperation{{
		SlotID: c3V02ClientSlotID, OperationID: operation, SchemaID: 1, Input: input,
	}}})
	if err != nil {
		return nil, fmt.Errorf("execute C3.1 v0.2 operation %d: %w", operation, err)
	}
	if len(batchResult.Operations) != 1 {
		return nil, fmt.Errorf("C3.1 v0.2 operation %d result count=%d want=1", operation, len(batchResult.Operations))
	}
	op := batchResult.Operations[0]
	if op.SlotID != c3V02ClientSlotID {
		return nil, fmt.Errorf("C3.1 v0.2 operation %d result slot=%d want=%d", operation, op.SlotID, c3V02ClientSlotID)
	}
	if op.OperationID != operation {
		return nil, fmt.Errorf("C3.1 v0.2 result operation=%d want=%d", op.OperationID, operation)
	}
	if op.SchemaID != 1 {
		return nil, fmt.Errorf("C3.1 v0.2 operation %d result schema=%d want=1", operation, op.SchemaID)
	}
	if op.Status != V2StatusOK {
		return nil, fmt.Errorf("C3.1 v0.2 operation %d result status=%d", operation, op.Status)
	}
	if op.Err != nil {
		return nil, fmt.Errorf("C3.1 v0.2 operation %d result error: %w", operation, op.Err)
	}
	return append([]byte(nil), op.Payload...), nil
}
