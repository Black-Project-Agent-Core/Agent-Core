package analyticsengine

import (
	"context"
	"encoding/binary"
	"math"
	"strings"
	"testing"
)

func structuralDirectionInputForTest() StructuralDirectionV01Input {
	return StructuralDirectionV01Input{Rows: []StructuralDirectionV01InputRow{
		{RowKey: 1, ComparableRuns: 1, CurrentVolume: 70, CurrentEqual: 65, BaseConfidence: 90},
		{RowKey: 2, ComparableRuns: 2, CurrentVolume: 70, PriorVolume: 50, CurrentEqual: 68, PriorEqual: 52, BaseConfidence: 95},
	}}
}

func validStructuralDirectionResultPayloadForTest() []byte {
	out := make([]byte, structuralDirectionV01ResultHeaderBytes+2*structuralDirectionV01ResultRowBytes)
	binary.LittleEndian.PutUint64(out[0:8], 77)
	binary.LittleEndian.PutUint32(out[8:12], 2)

	off := structuralDirectionV01ResultHeaderBytes
	binary.LittleEndian.PutUint32(out[off:off+4], 1)
	out[off+4] = 0
	out[off+5] = 0
	out[off+6] = 0
	out[off+7] = 1
	binary.LittleEndian.PutUint64(out[off+16:off+24], math.Float64bits(55))

	off += structuralDirectionV01ResultRowBytes
	binary.LittleEndian.PutUint32(out[off:off+4], 2)
	out[off+4] = 1
	out[off+5] = 1
	out[off+6] = 1
	out[off+7] = 2
	binary.LittleEndian.PutUint64(out[off+8:off+16], math.Float64bits(68))
	binary.LittleEndian.PutUint64(out[off+16:off+24], math.Float64bits(65))
	return out
}

func TestEncodeStructuralDirectionV01IsCanonical(t *testing.T) {
	payload, err := EncodeStructuralDirectionV01(structuralDirectionInputForTest(), nil)
	if err != nil {
		t.Fatalf("EncodeStructuralDirectionV01: %v", err)
	}
	if len(payload) != structuralDirectionV01RequestHeaderBytes+2*structuralDirectionV01RequestRowBytes {
		t.Fatalf("payload bytes=%d", len(payload))
	}
	if got := binary.LittleEndian.Uint32(payload[0:4]); got != 2 {
		t.Fatalf("row count=%d want=2", got)
	}
	if binary.LittleEndian.Uint32(payload[4:8]) != 0 {
		t.Fatal("reserved header must be zero")
	}
	off := structuralDirectionV01RequestHeaderBytes + structuralDirectionV01RequestRowBytes
	if binary.LittleEndian.Uint32(payload[off:off+4]) != 2 || binary.LittleEndian.Uint32(payload[off+4:off+8]) != 2 {
		t.Fatalf("row metadata=%v", payload[off:off+8])
	}
}

func TestExecuteStructuralDirectionV01DecodesCanonicalResult(t *testing.T) {
	executor := &fakeProductRankingExecutor{result: AnalyticsBatchResult{Operations: []BatchOperationResult{{
		SlotID: 1, OperationID: V2OpStructuralDirectionV01, SchemaID: 1, Status: V2StatusOK,
		Payload: validStructuralDirectionResultPayloadForTest(),
	}}}}
	result, err := ExecuteStructuralDirectionV01(context.Background(), executor, structuralDirectionInputForTest())
	if err != nil {
		t.Fatalf("ExecuteStructuralDirectionV01: %v", err)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("rows=%d want=2", len(result.Rows))
	}
	first := result.Rows[0]
	if first.RowKey != 1 || first.StageCode != 0 || first.DirectionCode != 0 || first.TrendScore != nil || first.Confidence != 55 || len(first.ReasonCodes) != 1 || first.ReasonCodes[0] != "current_composition_only" {
		t.Fatalf("composition row=%+v", first)
	}
	second := result.Rows[1]
	if second.RowKey != 2 || second.StageCode != 1 || second.DirectionCode != 1 || second.TrendScore == nil || *second.TrendScore != 68 || second.Confidence != 65 || len(second.ReasonCodes) != 1 || second.ReasonCodes[0] != "movement_indication_only" {
		t.Fatalf("movement row=%+v", second)
	}
	if len(executor.seen.Operations) != 1 || executor.seen.Operations[0].OperationID != V2OpStructuralDirectionV01 {
		t.Fatalf("request=%+v", executor.seen)
	}
}

func TestExecuteStructuralDirectionV01RejectsMalformedResult(t *testing.T) {
	valid := validStructuralDirectionResultPayloadForTest()
	tests := []struct {
		name   string
		mutate func([]byte)
		want   string
	}{
		{"header reserved", func(p []byte) { p[12] = 1 }, "reserved"},
		{"stage", func(p []byte) { p[16+4] = 4 }, "stage"},
		{"direction", func(p []byte) { p[16+5] = 6 }, "direction"},
		{"trend validity", func(p []byte) { p[16+6] = 2 }, "validity"},
		{"reason mask", func(p []byte) { p[16+7] = 8 }, "reason"},
		{"row reserved", func(p []byte) { p[16+24] = 1 }, "reserved"},
		{"duplicate row key", func(p []byte) { binary.LittleEndian.PutUint32(p[16+32:16+36], 1) }, "unique"},
		{"absent trend nonzero", func(p []byte) { binary.LittleEndian.PutUint64(p[16+8:16+16], math.Float64bits(1)) }, "absent"},
		{"nan confidence", func(p []byte) { binary.LittleEndian.PutUint64(p[16+16:16+24], math.Float64bits(math.NaN())) }, "finite"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := append([]byte(nil), valid...)
			tt.mutate(payload)
			executor := &fakeProductRankingExecutor{result: AnalyticsBatchResult{Operations: []BatchOperationResult{{
				SlotID: 1, OperationID: V2OpStructuralDirectionV01, SchemaID: 1, Status: V2StatusOK, Payload: payload,
			}}}}
			_, err := ExecuteStructuralDirectionV01(context.Background(), executor, structuralDirectionInputForTest())
			if err == nil || !strings.Contains(strings.ToLower(err.Error()), tt.want) {
				t.Fatalf("err=%v want substring=%q", err, tt.want)
			}
		})
	}
}
