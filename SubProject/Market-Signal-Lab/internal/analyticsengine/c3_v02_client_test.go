package analyticsengine

import (
	"context"
	"encoding/binary"
	"math"
	"testing"
)

type c31FakeBatchExecutor struct {
	fn func(AnalyticsBatch) AnalyticsBatchResult
}

func (f c31FakeBatchExecutor) ExecuteAnalyticsBatch(_ context.Context, batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	return f.fn(batch), nil
}

func TestC31ClientsForwardCanonicalOperationsAndDecode(t *testing.T) {
	tests := []struct {
		name    string
		op      V2OperationID
		input   any
		payload []byte
		run     func(BatchExecutor) error
	}{
		{"acceleration", V2OpCompetitionAccelerationV02, CompetitionAccelerationV02Input{OlderCount: 80, PriorCount: 100, CurrentCount: 140}, accelerationResultPayload(25, 40, 15, 0), func(ex BatchExecutor) error {
			got, err := ExecuteCompetitionAccelerationV02(context.Background(), ex, CompetitionAccelerationV02Input{OlderCount: 80, PriorCount: 100, CurrentCount: 140})
			if err == nil && got.Acceleration != 15 {
				t.Fatalf("acceleration=%v", got.Acceleration)
			}
			return err
		}},
		{"momentum", V2OpDirectionalMomentumV02, DirectionalMomentumV02Input{Rising: 7, Neutral: 2, Falling: 1}, momentumResultPayload(60, 60, 10), func(ex BatchExecutor) error {
			got, err := ExecuteDirectionalMomentumV02(context.Background(), ex, DirectionalMomentumV02Input{Rising: 7, Neutral: 2, Falling: 1})
			if err == nil && (got.ODMI != 60 || got.ComparableProducts != 10) {
				t.Fatalf("momentum=%+v", got)
			}
			return err
		}},
		{"prr", V2OpPeerRelativeRankV02, PeerRelativeRankV02Input{SubjectIndex: 1, Values: []float64{-20, 10, 10, 80}}, prrResultPayload(50, 4), func(ex BatchExecutor) error {
			got, err := ExecutePeerRelativeRankV02(context.Background(), ex, PeerRelativeRankV02Input{SubjectIndex: 1, Values: []float64{-20, 10, 10, 80}})
			if err == nil && (got.Percentile != 50 || got.PeerGroupSize != 4) {
				t.Fatalf("prr=%+v", got)
			}
			return err
		}},
		{"author", V2OpAuthorConcentrationChangeV02, AuthorConcentrationChangeV02Input{Prior: 31.25, Current: 27.5}, authorResultPayload(-3.8), func(ex BatchExecutor) error {
			got, err := ExecuteAuthorConcentrationChangeV02(context.Background(), ex, AuthorConcentrationChangeV02Input{Prior: 31.25, Current: 27.5})
			if err == nil && got.Change != -3.8 {
				t.Fatalf("change=%v", got.Change)
			}
			return err
		}},
		{"movement", V2OpMovementDivergenceV02, MovementDivergenceV02Input{TotalChildCount: 4, Children: []MovementChildV02{{Value: 50, ProductMass: 10}, {Value: -10, ProductMass: 30}}}, movementResultPayload(5, 20, -15, 15, 50, 2, 4), func(ex BatchExecutor) error {
			got, err := ExecuteMovementDivergenceV02(context.Background(), ex, MovementDivergenceV02Input{TotalChildCount: 4, Children: []MovementChildV02{{Value: 50, ProductMass: 10}, {Value: -10, ProductMass: 30}}})
			if err == nil && (got.ProductMassWeighted != 5 || got.SignedDivergence != -15) {
				t.Fatalf("movement=%+v", got)
			}
			return err
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			executor := c31FakeBatchExecutor{fn: func(batch AnalyticsBatch) AnalyticsBatchResult {
				if len(batch.Operations) != 1 {
					t.Fatalf("operations=%d", len(batch.Operations))
				}
				op := batch.Operations[0]
				if op.SlotID != 1 || op.OperationID != tc.op || op.SchemaID != 1 {
					t.Fatalf("op=%+v", op)
				}
				return AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: tc.op, SchemaID: 1, Status: V2StatusOK, Payload: tc.payload}}}
			}}
			if err := tc.run(executor); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestEncodeAnalyticsBatchV2SupportsAllC31Operations(t *testing.T) {
	batch := AnalyticsBatch{Operations: []BatchOperation{
		{SlotID: 1, OperationID: V2OpCompetitionAccelerationV02, SchemaID: 1, Input: CompetitionAccelerationV02Input{OlderCount: 1, PriorCount: 2, CurrentCount: 3}},
		{SlotID: 2, OperationID: V2OpDirectionalMomentumV02, SchemaID: 1, Input: DirectionalMomentumV02Input{Rising: 1, Neutral: 1, Falling: 1}},
		{SlotID: 3, OperationID: V2OpPeerRelativeRankV02, SchemaID: 1, Input: PeerRelativeRankV02Input{SubjectIndex: 0, Values: []float64{10, 20}}},
		{SlotID: 4, OperationID: V2OpAuthorConcentrationChangeV02, SchemaID: 1, Input: AuthorConcentrationChangeV02Input{Prior: 10, Current: 20}},
		{SlotID: 5, OperationID: V2OpMovementDivergenceV02, SchemaID: 1, Input: MovementDivergenceV02Input{TotalChildCount: 2, Children: []MovementChildV02{{Value: 10, ProductMass: 1}, {Value: -10, ProductMass: 1}}}},
	}}
	encoded, err := encodeAnalyticsBatchV2(99, batch, nil)
	if err != nil {
		t.Fatal(err)
	}
	header, err := DecodeV2Header(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if header.OperationCount != 5 {
		t.Fatalf("operationCount=%d", header.OperationCount)
	}
	for i, want := range []V2OperationID{9, 10, 11, 12, 13} {
		off := V2HeaderBytes + i*V2OperationDescriptorBytes
		descriptor, err := DecodeV2Descriptor(encoded[off : off+V2OperationDescriptorBytes])
		if err != nil {
			t.Fatal(err)
		}
		if descriptor.OperationID != want {
			t.Fatalf("descriptor %d op=%d want=%d", i, descriptor.OperationID, want)
		}
	}
}

func accelerationResultPayload(prev, curr, accel float64, flags uint32) []byte {
	out := make([]byte, 40)
	binary.LittleEndian.PutUint64(out[0:8], 1)
	putF64(out, 8, prev)
	putF64(out, 16, curr)
	putF64(out, 24, accel)
	binary.LittleEndian.PutUint32(out[32:36], flags)
	return out
}
func momentumResultPayload(odmi, magnitude float64, comparable uint64) []byte {
	out := make([]byte, 32)
	binary.LittleEndian.PutUint64(out[0:8], 1)
	putF64(out, 8, odmi)
	putF64(out, 16, magnitude)
	binary.LittleEndian.PutUint64(out[24:32], comparable)
	return out
}
func prrResultPayload(percentile float64, count uint64) []byte {
	out := make([]byte, 24)
	binary.LittleEndian.PutUint64(out[0:8], 1)
	putF64(out, 8, percentile)
	binary.LittleEndian.PutUint64(out[16:24], count)
	return out
}
func authorResultPayload(change float64) []byte {
	out := make([]byte, 16)
	binary.LittleEndian.PutUint64(out[0:8], 1)
	putF64(out, 8, change)
	return out
}
func movementResultPayload(weighted, equal, signed, magnitude, participation float64, eligible, total uint64) []byte {
	out := make([]byte, 64)
	binary.LittleEndian.PutUint64(out[0:8], 1)
	putF64(out, 8, weighted)
	putF64(out, 16, equal)
	putF64(out, 24, signed)
	putF64(out, 32, magnitude)
	putF64(out, 40, participation)
	binary.LittleEndian.PutUint64(out[48:56], eligible)
	binary.LittleEndian.PutUint64(out[56:64], total)
	return out
}
func putF64(out []byte, off int, value float64) {
	binary.LittleEndian.PutUint64(out[off:off+8], math.Float64bits(value))
}
