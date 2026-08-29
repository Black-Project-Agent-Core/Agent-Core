package analyticsengine

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
)

const (
	productRankingV01ClientSlotID      uint32 = 1
	productRankingV01ResultHeaderBytes        = 16
)

func ExecuteProductRankingV01(
	ctx context.Context,
	executor BatchExecutor,
	input ProductRankingV01Input,
) (ProductRankingV01Result, error) {
	if executor == nil {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 executor is required",
		)
	}
	if ctx == nil {
		ctx = context.Background()
	}

	batch := AnalyticsBatch{
		Operations: []BatchOperation{
			{
				SlotID:      productRankingV01ClientSlotID,
				OperationID: V2OpProductRankingV01,
				SchemaID:    1,
				Input:       input,
			},
		},
	}

	batchResult, err := executor.ExecuteAnalyticsBatch(ctx, batch)
	if err != nil {
		return ProductRankingV01Result{}, fmt.Errorf(
			"execute product ranking v0.1: %w",
			err,
		)
	}

	if len(batchResult.Operations) != 1 {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result count=%d want=1",
			len(batchResult.Operations),
		)
	}

	op := batchResult.Operations[0]

	if op.SlotID != productRankingV01ClientSlotID {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result slot=%d want=%d",
			op.SlotID,
			productRankingV01ClientSlotID,
		)
	}

	if op.OperationID != V2OpProductRankingV01 {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result operation=%d want=%d",
			op.OperationID,
			V2OpProductRankingV01,
		)
	}

	if op.SchemaID != 1 {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result schema=%d want=1",
			op.SchemaID,
		)
	}

	if op.Status != V2StatusOK {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result status=%d",
			op.Status,
		)
	}

	if op.Err != nil {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result error: %w",
			op.Err,
		)
	}

	return decodeProductRankingV01Result(op.Payload)
}

func decodeProductRankingV01Result(
	payload []byte,
) (ProductRankingV01Result, error) {
	if len(payload) < productRankingV01ResultHeaderBytes {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result payload is truncated",
		)
	}

	for _, b := range payload[12:16] {
		if b != 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 result reserved header bytes must be zero",
			)
		}
	}

	rowCount64 := uint64(binary.LittleEndian.Uint32(payload[8:12]))

	maxInt := uint64(^uint(0) >> 1)
	if rowCount64 > maxInt {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result row count exceeds platform size",
		)
	}

	rowCount := int(rowCount64)

	rowBytes, ok := checkedMulInt(
		rowCount,
		productRankingV01ResultRowBytes,
	)
	if !ok {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result row size overflow",
		)
	}

	expectedLen, ok := checkedAddInt(
		productRankingV01ResultHeaderBytes,
		rowBytes,
	)
	if !ok || len(payload) != expectedLen {
		return ProductRankingV01Result{}, fmt.Errorf(
			"product ranking v0.1 result payload length=%d want=%d",
			len(payload),
			expectedLen,
		)
	}

	rows := make([]ProductRankingV01ResultRow, rowCount)

	for i := 0; i < rowCount; i++ {
		off := productRankingV01ResultHeaderBytes +
			i*productRankingV01ResultRowBytes

		productKey := binary.LittleEndian.Uint32(
			payload[off : off+4],
		)
		if productKey == 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 result product key must be non-zero",
			)
		}

		flags := binary.LittleEndian.Uint32(
			payload[off+24 : off+28],
		)
		if flags&^uint32(0b111) != 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 result flags are invalid",
			)
		}

		directionCode := payload[off+28]
		if directionCode > 4 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 result direction code is invalid",
			)
		}

		for _, b := range payload[off+29 : off+32] {
			if b != 0 {
				return ProductRankingV01Result{}, fmt.Errorf(
					"product ranking v0.1 result reserved row bytes must be zero",
				)
			}
		}

		readFinite := func(
			fieldOffset int,
			field string,
		) (float64, error) {
			start := off + fieldOffset
			end := start + 8

			value := math.Float64frombits(
				binary.LittleEndian.Uint64(payload[start:end]),
			)

			if !finiteRankingFloat(value) {
				return 0, fmt.Errorf(
					"product ranking v0.1 result %s must be finite",
					field,
				)
			}

			return value, nil
		}

		medianPosition, err := readFinite(
			32,
			"median position",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		rankVelocity, err := readFinite(
			48,
			"rank velocity",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		exposureScore, err := readFinite(
			64,
			"exposure score",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		freshnessScore, err := readFinite(
			72,
			"freshness score",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		crossQueryStrength, err := readFinite(
			80,
			"cross-query strength",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		relativeStrength, err := readFinite(
			88,
			"relative strength",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		confidence, err := readFinite(
			96,
			"confidence",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		coverage, err := readFinite(
			104,
			"coverage",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		opportunityScore, err := readFinite(
			112,
			"opportunity score",
		)
		if err != nil {
			return ProductRankingV01Result{}, err
		}

		var previousMedianPosition *float64

		if flags&(1<<0) != 0 {
			value, err := readFinite(
				40,
				"previous median position",
			)
			if err != nil {
				return ProductRankingV01Result{}, err
			}
			previousMedianPosition = &value
		} else if binary.LittleEndian.Uint64(
			payload[off+40:off+48],
		) != 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 absent previous median must be zero",
			)
		}

		var rankVelocityScore *float64

		if flags&(1<<1) != 0 {
			value, err := readFinite(
				56,
				"rank velocity score",
			)
			if err != nil {
				return ProductRankingV01Result{}, err
			}
			rankVelocityScore = &value
		} else if binary.LittleEndian.Uint64(
			payload[off+56:off+64],
		) != 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 absent rank velocity score must be zero",
			)
		}

		missingMask := binary.LittleEndian.Uint64(
			payload[off+120 : off+128],
		)

		if missingMask&^uint64(0b11) != 0 {
			return ProductRankingV01Result{}, fmt.Errorf(
				"product ranking v0.1 result missing mask is invalid",
			)
		}

		rows[i] = ProductRankingV01ResultRow{
			ProductKey: productKey,

			CurrentObservationCount: binary.LittleEndian.Uint32(
				payload[off+4 : off+8],
			),
			PreviousObservationCount: binary.LittleEndian.Uint32(
				payload[off+8 : off+12],
			),
			QueryAppearances: binary.LittleEndian.Uint32(
				payload[off+12 : off+16],
			),
			ApplicableQueries: binary.LittleEndian.Uint32(
				payload[off+16 : off+20],
			),
			SurfaceAppearances: binary.LittleEndian.Uint32(
				payload[off+20 : off+24],
			),

			MedianPosition:         medianPosition,
			PreviousMedianPosition: previousMedianPosition,

			RankVelocity:      rankVelocity,
			RankVelocityScore: rankVelocityScore,

			ExposureScore:      exposureScore,
			FreshnessScore:     freshnessScore,
			CrossQueryStrength: crossQueryStrength,
			RelativeStrength:   relativeStrength,

			DirectionCode:     directionCode,
			ComparableHistory: flags&(1<<2) != 0,

			Confidence:       confidence,
			Coverage:         coverage,
			OpportunityScore: opportunityScore,

			MissingMask: missingMask,
		}
	}

	return ProductRankingV01Result{
		Rows: rows,
	}, nil
}

const (
	catalogRankingV01ClientSlotID      uint32 = 1
	catalogRankingV01ResultHeaderBytes        = 16
	catalogRankingV01ResultRowBytes           = 192
)

func ExecuteCatalogRankingV01(
	ctx context.Context,
	executor BatchExecutor,
	input CatalogRankingV01Input,
) (CatalogRankingV01Result, error) {
	if executor == nil {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 executor is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	batch := AnalyticsBatch{Operations: []BatchOperation{{
		SlotID:      catalogRankingV01ClientSlotID,
		OperationID: V2OpCatalogRankingV01,
		SchemaID:    1,
		Input:       input,
	}}}
	batchResult, err := executor.ExecuteAnalyticsBatch(ctx, batch)
	if err != nil {
		return CatalogRankingV01Result{}, fmt.Errorf("execute catalog ranking v0.1: %w", err)
	}
	if len(batchResult.Operations) != 1 {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result count=%d want=1", len(batchResult.Operations))
	}
	op := batchResult.Operations[0]
	if op.SlotID != catalogRankingV01ClientSlotID {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result slot=%d want=%d", op.SlotID, catalogRankingV01ClientSlotID)
	}
	if op.OperationID != V2OpCatalogRankingV01 {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result operation=%d want=%d", op.OperationID, V2OpCatalogRankingV01)
	}
	if op.SchemaID != 1 {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result schema=%d want=1", op.SchemaID)
	}
	if op.Status != V2StatusOK {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result status=%d", op.Status)
	}
	if op.Err != nil {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result error: %w", op.Err)
	}
	return decodeCatalogRankingV01Result(op.Payload)
}

func decodeCatalogRankingV01Result(payload []byte) (CatalogRankingV01Result, error) {
	if len(payload) < catalogRankingV01ResultHeaderBytes {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result payload is truncated")
	}
	for _, b := range payload[12:16] {
		if b != 0 {
			return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result reserved header bytes must be zero")
		}
	}

	rowCount64 := uint64(binary.LittleEndian.Uint32(payload[8:12]))
	maxInt := uint64(^uint(0) >> 1)
	if rowCount64 > maxInt {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result row count exceeds platform size")
	}
	rowCount := int(rowCount64)
	rowBytes, ok := checkedMulInt(rowCount, catalogRankingV01ResultRowBytes)
	if !ok {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result row size overflow")
	}
	expectedLen, ok := checkedAddInt(catalogRankingV01ResultHeaderBytes, rowBytes)
	if !ok || len(payload) != expectedLen {
		return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result payload length=%d want=%d", len(payload), expectedLen)
	}

	rows := make([]CatalogRankingV01ResultRow, rowCount)
	for i := 0; i < rowCount; i++ {
		off := catalogRankingV01ResultHeaderBytes + i*catalogRankingV01ResultRowBytes
		catalogKey := binary.LittleEndian.Uint32(payload[off : off+4])
		if catalogKey == 0 {
			return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result catalog key must be non-zero")
		}
		directionCode := payload[off+36]
		if directionCode > 4 {
			return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result direction code is invalid")
		}
		for _, b := range payload[off+37 : off+40] {
			if b != 0 {
				return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result reserved row bytes must be zero")
			}
		}

		readFinite := func(fieldOffset int, field string) (float64, error) {
			start := off + fieldOffset
			value := math.Float64frombits(binary.LittleEndian.Uint64(payload[start : start+8]))
			if !finiteRankingFloat(value) {
				return 0, fmt.Errorf("catalog ranking v0.1 result %s must be finite", field)
			}
			return value, nil
		}
		values := make(map[int]float64, 18)
		for fieldOffset, field := range map[int]string{
			40: "median rank velocity", 48: "exposure breadth", 56: "demand momentum percent",
			64: "demand momentum index", 72: "new supply velocity percent", 80: "new supply velocity index",
			88: "competition acceleration", 96: "competition momentum index", 104: "author concentration",
			112: "author attribution coverage", 120: "freshness index", 128: "relative strength",
			136: "supply gap", 144: "direction index", 152: "trend score", 160: "opportunity score",
			168: "confidence", 176: "coverage",
		} {
			value, err := readFinite(fieldOffset, field)
			if err != nil {
				return CatalogRankingV01Result{}, err
			}
			values[fieldOffset] = value
		}

		missingMask := binary.LittleEndian.Uint64(payload[off+184 : off+192])
		if missingMask&^uint64(0b1111) != 0 {
			return CatalogRankingV01Result{}, fmt.Errorf("catalog ranking v0.1 result missing mask is invalid")
		}

		rows[i] = CatalogRankingV01ResultRow{
			CatalogKey:                catalogKey,
			ObservedProducts:          binary.LittleEndian.Uint32(payload[off+4 : off+8]),
			ObservedAuthors:           binary.LittleEndian.Uint32(payload[off+8 : off+12]),
			NewProducts:               binary.LittleEndian.Uint32(payload[off+12 : off+16]),
			PreviousNewProducts:       binary.LittleEndian.Uint32(payload[off+16 : off+20]),
			RisingProducts:            binary.LittleEndian.Uint32(payload[off+20 : off+24]),
			NeutralProducts:           binary.LittleEndian.Uint32(payload[off+24 : off+28]),
			FallingProducts:           binary.LittleEndian.Uint32(payload[off+28 : off+32]),
			ComparableProducts:        binary.LittleEndian.Uint32(payload[off+32 : off+36]),
			MedianRankVelocity:        values[40],
			ExposureBreadth:           values[48],
			DemandMomentumPercent:     values[56],
			DemandMomentumIndex:       values[64],
			NewSupplyVelocityPercent:  values[72],
			NewSupplyVelocityIndex:    values[80],
			CompetitionAcceleration:   values[88],
			CompetitionMomentumIndex:  values[96],
			AuthorConcentration:       values[104],
			AuthorAttributionCoverage: values[112],
			FreshnessIndex:            values[120],
			RelativeStrength:          values[128],
			SupplyGap:                 values[136],
			DirectionIndex:            values[144],
			TrendScore:                values[152],
			OpportunityScore:          values[160],
			DirectionCode:             directionCode,
			Confidence:                values[168],
			Coverage:                  values[176],
			MissingMask:               missingMask,
		}
	}
	return CatalogRankingV01Result{Rows: rows}, nil
}

const (
	structuralIndexV01ClientSlotID      uint32 = 1
	structuralIndexV01ResultHeaderBytes        = 24
	structuralIndexV01ResultRowBytes           = 72
	structuralIndexV01WeightResultBytes        = 32
	structuralIndexV01WeightBytes              = 16
)

func ExecuteStructuralIndexV01(
	ctx context.Context,
	executor BatchExecutor,
	input StructuralIndexV01Input,
) (StructuralIndexV01Result, error) {
	if executor == nil {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 executor is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	batchResult, err := executor.ExecuteAnalyticsBatch(ctx, AnalyticsBatch{Operations: []BatchOperation{{
		SlotID: structuralIndexV01ClientSlotID, OperationID: V2OpStructuralIndexV01, SchemaID: 1, Input: input,
	}}})
	if err != nil {
		return StructuralIndexV01Result{}, fmt.Errorf("execute structural index v0.1: %w", err)
	}
	if len(batchResult.Operations) != 1 {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result count=%d want=1", len(batchResult.Operations))
	}
	op := batchResult.Operations[0]
	if op.SlotID != structuralIndexV01ClientSlotID {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result slot=%d want=%d", op.SlotID, structuralIndexV01ClientSlotID)
	}
	if op.OperationID != V2OpStructuralIndexV01 {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result operation=%d want=%d", op.OperationID, V2OpStructuralIndexV01)
	}
	if op.SchemaID != 1 {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result schema=%d want=1", op.SchemaID)
	}
	if op.Status != V2StatusOK {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result status=%d", op.Status)
	}
	if op.Err != nil {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result error: %w", op.Err)
	}
	return decodeStructuralIndexV01Result(op.Payload)
}

func decodeStructuralIndexV01Result(payload []byte) (StructuralIndexV01Result, error) {
	if len(payload) < structuralIndexV01ResultHeaderBytes {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result payload is truncated")
	}
	if binary.LittleEndian.Uint32(payload[20:24]) != 0 {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result reserved header bytes must be zero")
	}
	rowCount := int(binary.LittleEndian.Uint32(payload[8:12]))
	weightResultCount := int(binary.LittleEndian.Uint32(payload[12:16]))
	weightCount := int(binary.LittleEndian.Uint32(payload[16:20]))
	rowBytes, ok := checkedMulInt(rowCount, structuralIndexV01ResultRowBytes)
	if !ok {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result row size overflow")
	}
	weightResultBytes, ok := checkedMulInt(weightResultCount, structuralIndexV01WeightResultBytes)
	if !ok {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight-result size overflow")
	}
	weightBytes, ok := checkedMulInt(weightCount, structuralIndexV01WeightBytes)
	if !ok {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight size overflow")
	}
	expected, ok := checkedAddInt(structuralIndexV01ResultHeaderBytes, rowBytes)
	if !ok {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result size overflow")
	}
	expected, ok = checkedAddInt(expected, weightResultBytes)
	if !ok {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result size overflow")
	}
	expected, ok = checkedAddInt(expected, weightBytes)
	if !ok || len(payload) != expected {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result payload length=%d want=%d", len(payload), expected)
	}

	rows := make([]StructuralIndexV01ResultRow, rowCount)
	for i := range rows {
		off := structuralIndexV01ResultHeaderBytes + i*structuralIndexV01ResultRowBytes
		segmentKey := binary.LittleEndian.Uint32(payload[off : off+4])
		level := payload[off+8]
		if level > 5 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result level code is invalid")
		}
		if level != 0 && segmentKey == 0 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result segment key must be non-zero outside global")
		}
		divergence := payload[off+9]
		if divergence > 2 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result divergence state is invalid")
		}
		stage := payload[off+10]
		if stage > 3 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result direction stage is invalid")
		}
		grade := payload[off+11]
		if grade < 1 || grade > 4 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 result data-quality grade is invalid")
		}
		readFinite := func(field int, name string) (float64, error) {
			value := math.Float64frombits(binary.LittleEndian.Uint64(payload[off+field : off+field+8]))
			if !finiteRankingFloat(value) {
				return 0, fmt.Errorf("structural index v0.1 result %s must be finite", name)
			}
			return value, nil
		}
		values := map[int]float64{}
		for field, name := range map[int]string{16: "composition", 24: "volume weighted", 32: "equal sector", 40: "divergence", 48: "coverage", 56: "confidence", 64: "data quality"} {
			value, err := readFinite(field, name)
			if err != nil {
				return StructuralIndexV01Result{}, err
			}
			values[field] = value
		}
		rows[i] = StructuralIndexV01ResultRow{
			SegmentKey: segmentKey, ParentKey: binary.LittleEndian.Uint32(payload[off+4 : off+8]), LevelCode: level,
			CompositionIndex: values[16], VolumeWeightedValue: values[24], EqualSectorValue: values[32], DivergenceValue: values[40],
			DivergenceStateCode: divergence, DirectionStageCode: stage, Coverage: values[48], Confidence: values[56],
			DataQualityScore: values[64], DataQualityGrade: grade, SampleSize: binary.LittleEndian.Uint32(payload[off+12 : off+16]),
		}
	}

	weightResultsStart := structuralIndexV01ResultHeaderBytes + rowBytes
	weightsStart := weightResultsStart + weightResultBytes
	weightResults := make([]StructuralIndexWeightResultV01, weightResultCount)
	cursor := 0
	for i := range weightResults {
		off := weightResultsStart + i*structuralIndexV01WeightResultBytes
		fallbackMask := binary.LittleEndian.Uint32(payload[off+4 : off+8])
		if fallbackMask&^uint32(1) != 0 {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 fallback mask is invalid")
		}
		configured := math.Float64frombits(binary.LittleEndian.Uint64(payload[off+8 : off+16]))
		effective := math.Float64frombits(binary.LittleEndian.Uint64(payload[off+16 : off+24]))
		if !finiteRankingFloat(configured) || !finiteRankingFloat(effective) {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight caps must be finite")
		}
		start := int(binary.LittleEndian.Uint32(payload[off+24 : off+28]))
		length := int(binary.LittleEndian.Uint32(payload[off+28 : off+32]))
		if start != cursor || start < 0 || length < 0 || start+length > weightCount {
			return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight ranges are non-canonical")
		}
		weights := make([]StructuralIndexWeightV01, length)
		for j := 0; j < length; j++ {
			woff := weightsStart + (start+j)*structuralIndexV01WeightBytes
			segmentKey := binary.LittleEndian.Uint32(payload[woff : woff+4])
			if segmentKey == 0 {
				return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight segment key must be non-zero")
			}
			if binary.LittleEndian.Uint32(payload[woff+4:woff+8]) != 0 {
				return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight reserved bytes must be zero")
			}
			weight := math.Float64frombits(binary.LittleEndian.Uint64(payload[woff+8 : woff+16]))
			if !finiteRankingFloat(weight) {
				return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 weight must be finite")
			}
			weights[j] = StructuralIndexWeightV01{SegmentKey: segmentKey, Weight: weight}
		}
		cursor += length
		weightResults[i] = StructuralIndexWeightResultV01{ParentKey: binary.LittleEndian.Uint32(payload[off : off+4]), ConfiguredCap: configured, EffectiveCap: effective, FallbackMask: fallbackMask, Weights: weights}
	}
	if cursor != weightCount {
		return StructuralIndexV01Result{}, fmt.Errorf("structural index v0.1 flattened weights are incomplete")
	}
	return StructuralIndexV01Result{Rows: rows, WeightResults: weightResults}, nil
}
