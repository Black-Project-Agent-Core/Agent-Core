package analyticsengine

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

const (
	structuralDirectionV01RequestHeaderBytes = 8
	structuralDirectionV01RequestRowBytes    = 48
	structuralDirectionV01ResultHeaderBytes  = 16
	structuralDirectionV01ResultRowBytes     = 32
	structuralDirectionV01ClientSlotID       = 1
)

type StructuralDirectionV01InputRow struct {
	RowKey         uint32
	ComparableRuns uint32
	CurrentVolume  float64
	PriorVolume    float64
	CurrentEqual   float64
	PriorEqual     float64
	BaseConfidence float64
}

type StructuralDirectionV01Input struct {
	Rows []StructuralDirectionV01InputRow
}

type StructuralDirectionV01ResultRow struct {
	RowKey        uint32
	StageCode     uint8
	DirectionCode uint8
	TrendScore    *float64
	Confidence    float64
	ReasonCodes   []string
}

type StructuralDirectionV01Result struct {
	Rows []StructuralDirectionV01ResultRow
}

func EncodeStructuralDirectionV01(in StructuralDirectionV01Input, dst []byte) ([]byte, error) {
	if len(in.Rows) == 0 {
		return nil, errors.New("structural direction v0.1 requires rows")
	}
	if uint64(len(in.Rows)) > uint64(^uint32(0)) {
		return nil, errors.New("structural direction v0.1 row count exceeds schema limit")
	}
	rowsBytes, ok := checkedMulInt(len(in.Rows), structuralDirectionV01RequestRowBytes)
	if !ok {
		return nil, errors.New("structural direction v0.1 payload size overflow")
	}
	total, ok := checkedAddInt(structuralDirectionV01RequestHeaderBytes, rowsBytes)
	if !ok {
		return nil, errors.New("structural direction v0.1 payload size overflow")
	}
	out := resizeV2Buffer(dst, total)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Rows)))
	for i, row := range in.Rows {
		if row.RowKey == 0 {
			return nil, errors.New("structural direction v0.1 row key must be non-zero")
		}
		for _, value := range []float64{row.CurrentVolume, row.PriorVolume, row.CurrentEqual, row.PriorEqual, row.BaseConfidence} {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, errors.New("structural direction v0.1 values must be finite")
			}
		}
		off := structuralDirectionV01RequestHeaderBytes + i*structuralDirectionV01RequestRowBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.RowKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.ComparableRuns)
		for field, value := range map[int]float64{
			8:  row.CurrentVolume,
			16: row.PriorVolume,
			24: row.CurrentEqual,
			32: row.PriorEqual,
			40: row.BaseConfidence,
		} {
			binary.LittleEndian.PutUint64(out[off+field:off+field+8], math.Float64bits(value))
		}
	}
	return out, nil
}

func ExecuteStructuralDirectionV01(ctx context.Context, executor BatchExecutor, input StructuralDirectionV01Input) (StructuralDirectionV01Result, error) {
	if executor == nil {
		return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 executor is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	batchResult, err := executor.ExecuteAnalyticsBatch(ctx, AnalyticsBatch{Operations: []BatchOperation{{
		SlotID: structuralDirectionV01ClientSlotID, OperationID: V2OpStructuralDirectionV01, SchemaID: 1, Input: input,
	}}})
	if err != nil {
		return StructuralDirectionV01Result{}, fmt.Errorf("execute structural direction v0.1: %w", err)
	}
	if len(batchResult.Operations) != 1 {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result count=%d want=1", len(batchResult.Operations))
	}
	op := batchResult.Operations[0]
	if op.SlotID != structuralDirectionV01ClientSlotID {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result slot=%d want=%d", op.SlotID, structuralDirectionV01ClientSlotID)
	}
	if op.OperationID != V2OpStructuralDirectionV01 {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result operation=%d want=%d", op.OperationID, V2OpStructuralDirectionV01)
	}
	if op.SchemaID != 1 {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result schema=%d want=1", op.SchemaID)
	}
	if op.Status != V2StatusOK {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result status=%d", op.Status)
	}
	if op.Err != nil {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result error: %w", op.Err)
	}
	return decodeStructuralDirectionV01Result(op.Payload)
}

func decodeStructuralDirectionV01Result(payload []byte) (StructuralDirectionV01Result, error) {
	if len(payload) < structuralDirectionV01ResultHeaderBytes {
		return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result payload is truncated")
	}
	if binary.LittleEndian.Uint32(payload[12:16]) != 0 {
		return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result reserved header bytes must be zero")
	}
	rowCount := int(binary.LittleEndian.Uint32(payload[8:12]))
	rowsBytes, ok := checkedMulInt(rowCount, structuralDirectionV01ResultRowBytes)
	if !ok {
		return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result row size overflow")
	}
	expected, ok := checkedAddInt(structuralDirectionV01ResultHeaderBytes, rowsBytes)
	if !ok || len(payload) != expected {
		return StructuralDirectionV01Result{}, fmt.Errorf("structural direction v0.1 result payload length=%d want=%d", len(payload), expected)
	}
	rows := make([]StructuralDirectionV01ResultRow, rowCount)
	seen := make(map[uint32]struct{}, rowCount)
	for i := range rows {
		off := structuralDirectionV01ResultHeaderBytes + i*structuralDirectionV01ResultRowBytes
		rowKey := binary.LittleEndian.Uint32(payload[off : off+4])
		if rowKey == 0 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result row key must be non-zero")
		}
		if _, exists := seen[rowKey]; exists {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result row key must be unique")
		}
		seen[rowKey] = struct{}{}
		stage := payload[off+4]
		direction := payload[off+5]
		trendValid := payload[off+6]
		reasonMask := payload[off+7]
		if stage > 3 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result stage code is invalid")
		}
		if direction > 5 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result direction code is invalid")
		}
		if trendValid > 1 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result trend validity is invalid")
		}
		if reasonMask&^uint8(0b111) != 0 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result reason mask is invalid")
		}
		if binary.LittleEndian.Uint64(payload[off+24:off+32]) != 0 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result reserved row bytes must be zero")
		}
		trendRaw := binary.LittleEndian.Uint64(payload[off+8 : off+16])
		confidence := math.Float64frombits(binary.LittleEndian.Uint64(payload[off+16 : off+24]))
		if math.IsNaN(confidence) || math.IsInf(confidence, 0) {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result confidence must be finite")
		}
		var trend *float64
		if trendValid == 1 {
			value := math.Float64frombits(trendRaw)
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 result trend score must be finite")
			}
			trend = &value
		} else if trendRaw != 0 {
			return StructuralDirectionV01Result{}, errors.New("structural direction v0.1 absent trend score must be zero")
		}
		reasons := make([]string, 0, 1)
		if reasonMask&1 != 0 {
			reasons = append(reasons, "current_composition_only")
		}
		if reasonMask&2 != 0 {
			reasons = append(reasons, "movement_indication_only")
		}
		if reasonMask&4 != 0 {
			reasons = append(reasons, "preliminary_trend")
		}
		rows[i] = StructuralDirectionV01ResultRow{
			RowKey: rowKey, StageCode: stage, DirectionCode: direction, TrendScore: trend, Confidence: confidence, ReasonCodes: reasons,
		}
	}
	return StructuralDirectionV01Result{Rows: rows}, nil
}
