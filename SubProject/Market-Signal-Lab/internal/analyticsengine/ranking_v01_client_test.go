package analyticsengine

import (
	"context"
	"encoding/binary"
	"errors"
	"math"
	"strings"
	"testing"
)

type fakeProductRankingExecutor struct {
	result AnalyticsBatchResult
	err    error
	seen   AnalyticsBatch
}

func (f *fakeProductRankingExecutor) ExecuteAnalyticsBatch(
	_ context.Context,
	batch AnalyticsBatch,
) (AnalyticsBatchResult, error) {
	f.seen = batch
	return f.result, f.err
}

func validProductRankingResultPayloadForTest() []byte {
	const (
		headerBytes = 16
		rowBytes    = 128
	)

	out := make([]byte, headerBytes+rowBytes)

	binary.LittleEndian.PutUint64(out[0:8], 123)
	binary.LittleEndian.PutUint32(out[8:12], 1)

	off := headerBytes

	binary.LittleEndian.PutUint32(out[off:off+4], 1)
	binary.LittleEndian.PutUint32(out[off+4:off+8], 1)
	binary.LittleEndian.PutUint32(out[off+8:off+12], 0)
	binary.LittleEndian.PutUint32(out[off+12:off+16], 1)
	binary.LittleEndian.PutUint32(out[off+16:off+20], 2)
	binary.LittleEndian.PutUint32(out[off+20:off+24], 1)

	// flags=0:
	// no previous median
	// no rank velocity score
	// no comparable history
	binary.LittleEndian.PutUint32(out[off+24:off+28], 0)

	// neutral
	out[off+28] = 2

	putF64 := func(offset int, value float64) {
		binary.LittleEndian.PutUint64(
			out[offset:offset+8],
			math.Float64bits(value),
		)
	}

	putF64(off+32, 7.0)
	putF64(off+48, 0.0)
	putF64(off+64, 73.9)
	putF64(off+72, 100.0)
	putF64(off+80, 50.0)
	putF64(off+88, 50.0)
	putF64(off+96, 52.5)
	putF64(off+104, 90.0)
	putF64(off+112, 69.0)

	// rank_velocity + segmentation_fallback
	binary.LittleEndian.PutUint64(out[off+120:off+128], 0b11)

	return out
}

func productRankingInputForClientTest() ProductRankingV01Input {
	return ProductRankingV01Input{
		Products: []ProductRankingEntityV01{
			{
				ProductKey:           1,
				CatalogKey:           11,
				FirstSeenBucket:      RankingWindowCurrent,
				ApplicableQueryKeys:  []uint32{101, 102},
				SessionCoverages:     []float64{80, 100},
				SegmentationFallback: true,
			},
		},
		Observations: []ProductRankingObservationV01{
			{
				ProductKey:   1,
				WindowBucket: RankingWindowCurrent,
				QueryKey:     101,
				SurfaceCode:  1,
				Position:     7,
				Reliability:  0.9,
			},
		},
	}
}

func TestExecuteProductRankingV01RejectsMalformedBatchResults(t *testing.T) {
	validPayload := validProductRankingResultPayloadForTest()

	tests := []struct {
		name   string
		result AnalyticsBatchResult
		want   string
	}{
		{
			name: "missing result",
			result: AnalyticsBatchResult{
				Operations: nil,
			},
			want: "result",
		},
		{
			name: "wrong slot",
			result: AnalyticsBatchResult{
				Operations: []BatchOperationResult{
					{
						SlotID:      99,
						OperationID: V2OpProductRankingV01,
						SchemaID:    1,
						Status:      V2StatusOK,
						Payload:     validPayload,
					},
				},
			},
			want: "slot",
		},
		{
			name: "wrong operation",
			result: AnalyticsBatchResult{
				Operations: []BatchOperationResult{
					{
						SlotID:      1,
						OperationID: V2OpCatalogRankingV01,
						SchemaID:    1,
						Status:      V2StatusOK,
						Payload:     validPayload,
					},
				},
			},
			want: "operation",
		},
		{
			name: "wrong schema",
			result: AnalyticsBatchResult{
				Operations: []BatchOperationResult{
					{
						SlotID:      1,
						OperationID: V2OpProductRankingV01,
						SchemaID:    2,
						Status:      V2StatusOK,
						Payload:     validPayload,
					},
				},
			},
			want: "schema",
		},
		{
			name: "non ok status",
			result: AnalyticsBatchResult{
				Operations: []BatchOperationResult{
					{
						SlotID:      1,
						OperationID: V2OpProductRankingV01,
						SchemaID:    1,
						Status:      V2StatusInternalError,
						Payload:     nil,
					},
				},
			},
			want: "status",
		},
		{
			name: "truncated payload",
			result: AnalyticsBatchResult{
				Operations: []BatchOperationResult{
					{
						SlotID:      1,
						OperationID: V2OpProductRankingV01,
						SchemaID:    1,
						Status:      V2StatusOK,
						Payload:     make([]byte, 15),
					},
				},
			},
			want: "payload",
		},
		{
			name: "nonzero result header reserved",
			result: func() AnalyticsBatchResult {
				payload := append([]byte(nil), validPayload...)
				payload[12] = 1
				return AnalyticsBatchResult{
					Operations: []BatchOperationResult{
						{
							SlotID:      1,
							OperationID: V2OpProductRankingV01,
							SchemaID:    1,
							Status:      V2StatusOK,
							Payload:     payload,
						},
					},
				}
			}(),
			want: "reserved",
		},
		{
			name: "unknown flags",
			result: func() AnalyticsBatchResult {
				payload := append([]byte(nil), validPayload...)
				binary.LittleEndian.PutUint32(
					payload[16+24:16+28],
					1<<3,
				)
				return AnalyticsBatchResult{
					Operations: []BatchOperationResult{
						{
							SlotID:      1,
							OperationID: V2OpProductRankingV01,
							SchemaID:    1,
							Status:      V2StatusOK,
							Payload:     payload,
						},
					},
				}
			}(),
			want: "flags",
		},
		{
			name: "absent previous median must be zero",
			result: func() AnalyticsBatchResult {
				payload := append([]byte(nil), validPayload...)
				binary.LittleEndian.PutUint64(
					payload[16+40:16+48],
					math.Float64bits(1),
				)
				return AnalyticsBatchResult{
					Operations: []BatchOperationResult{
						{
							SlotID:      1,
							OperationID: V2OpProductRankingV01,
							SchemaID:    1,
							Status:      V2StatusOK,
							Payload:     payload,
						},
					},
				}
			}(),
			want: "previous median",
		},
		{
			name: "invalid direction",
			result: func() AnalyticsBatchResult {
				payload := append([]byte(nil), validPayload...)
				payload[16+28] = 5
				return AnalyticsBatchResult{
					Operations: []BatchOperationResult{
						{
							SlotID:      1,
							OperationID: V2OpProductRankingV01,
							SchemaID:    1,
							Status:      V2StatusOK,
							Payload:     payload,
						},
					},
				}
			}(),
			want: "direction",
		},
		{
			name: "unknown missing mask",
			result: func() AnalyticsBatchResult {
				payload := append([]byte(nil), validPayload...)
				binary.LittleEndian.PutUint64(
					payload[16+120:16+128],
					1<<2,
				)
				return AnalyticsBatchResult{
					Operations: []BatchOperationResult{
						{
							SlotID:      1,
							OperationID: V2OpProductRankingV01,
							SchemaID:    1,
							Status:      V2StatusOK,
							Payload:     payload,
						},
					},
				}
			}(),
			want: "missing",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			executor := &fakeProductRankingExecutor{
				result: tt.result,
			}

			_, err := ExecuteProductRankingV01(
				context.Background(),
				executor,
				productRankingInputForClientTest(),
			)

			if err == nil {
				t.Fatal("malformed product ranking result must be rejected")
			}

			if !strings.Contains(strings.ToLower(err.Error()), tt.want) {
				t.Fatalf("err=%q want substring=%q", err, tt.want)
			}

			if len(executor.seen.Operations) != 1 {
				t.Fatalf(
					"adapter sent %d operations want=1",
					len(executor.seen.Operations),
				)
			}

			op := executor.seen.Operations[0]

			if op.SlotID != 1 {
				t.Fatalf("request slot=%d want=1", op.SlotID)
			}

			if op.OperationID != V2OpProductRankingV01 {
				t.Fatalf(
					"request operation=%d want=%d",
					op.OperationID,
					V2OpProductRankingV01,
				)
			}

			if op.SchemaID != 1 {
				t.Fatalf("request schema=%d want=1", op.SchemaID)
			}

			if _, ok := op.Input.(ProductRankingV01Input); !ok {
				t.Fatalf("request input type=%T", op.Input)
			}
		})
	}
}

func TestExecuteProductRankingV01PropagatesExecutorError(t *testing.T) {
	executor := &fakeProductRankingExecutor{
		err: errors.New("executor unavailable"),
	}

	_, err := ExecuteProductRankingV01(
		context.Background(),
		executor,
		productRankingInputForClientTest(),
	)

	if err == nil || !strings.Contains(err.Error(), "executor unavailable") {
		t.Fatalf("err=%v", err)
	}
}

func TestExecuteProductRankingV01DecodesCanonicalResult(t *testing.T) {
	executor := &fakeProductRankingExecutor{
		result: AnalyticsBatchResult{
			Operations: []BatchOperationResult{
				{
					SlotID:         1,
					OperationID:    V2OpProductRankingV01,
					SchemaID:       1,
					Status:         V2StatusOK,
					Payload:        validProductRankingResultPayloadForTest(),
					DurationMicros: 123,
				},
			},
		},
	}

	result, err := ExecuteProductRankingV01(
		context.Background(),
		executor,
		productRankingInputForClientTest(),
	)
	if err != nil {
		t.Fatalf("ExecuteProductRankingV01: %v", err)
	}

	if len(result.Rows) != 1 {
		t.Fatalf("rows=%d want=1", len(result.Rows))
	}

	row := result.Rows[0]

	if row.ProductKey != 1 ||
		row.CurrentObservationCount != 1 ||
		row.PreviousObservationCount != 0 ||
		row.QueryAppearances != 1 ||
		row.ApplicableQueries != 2 ||
		row.SurfaceAppearances != 1 {
		t.Fatalf("row counts/identity=%+v", row)
	}

	if row.PreviousMedianPosition != nil {
		t.Fatalf(
			"previous median=%v want=nil",
			*row.PreviousMedianPosition,
		)
	}

	if row.RankVelocityScore != nil {
		t.Fatalf(
			"rank velocity score=%v want=nil",
			*row.RankVelocityScore,
		)
	}

	if row.ComparableHistory {
		t.Fatal("comparable history=true want=false")
	}

	if row.DirectionCode != 2 {
		t.Fatalf("direction=%d want=2", row.DirectionCode)
	}

	for label, pair := range map[string][2]float64{
		"median":      {row.MedianPosition, 7.0},
		"velocity":    {row.RankVelocity, 0.0},
		"exposure":    {row.ExposureScore, 73.9},
		"freshness":   {row.FreshnessScore, 100},
		"cross_query": {row.CrossQueryStrength, 50},
		"relative":    {row.RelativeStrength, 50},
		"confidence":  {row.Confidence, 52.5},
		"coverage":    {row.Coverage, 90},
		"opportunity": {row.OpportunityScore, 69},
	} {
		if math.Float64bits(pair[0]) != math.Float64bits(pair[1]) {
			t.Fatalf(
				"%s got=%v want=%v",
				label,
				pair[0],
				pair[1],
			)
		}
	}

	if row.MissingMask != 0b11 {
		t.Fatalf(
			"missingMask=%b want=11",
			row.MissingMask,
		)
	}
}

func validCatalogRankingResultPayloadForTest() []byte {
	const headerBytes = 16
	const rowBytes = 192
	out := make([]byte, headerBytes+rowBytes)
	binary.LittleEndian.PutUint64(out[0:8], 321)
	binary.LittleEndian.PutUint32(out[8:12], 1)
	off := headerBytes
	for fieldOffset, value := range map[int]uint32{
		0: 11, 4: 1, 8: 1, 12: 1, 16: 0, 20: 1, 24: 0, 28: 0, 32: 1,
	} {
		binary.LittleEndian.PutUint32(out[off+fieldOffset:off+fieldOffset+4], value)
	}
	out[off+36] = 3
	putF64 := func(fieldOffset int, value float64) {
		binary.LittleEndian.PutUint64(out[off+fieldOffset:off+fieldOffset+8], math.Float64bits(value))
	}
	for fieldOffset, value := range map[int]float64{
		40: 2, 48: 100, 56: 100, 64: 75, 72: 100, 80: 75, 88: 100, 96: 75,
		104: 100, 112: 100, 120: 100, 128: 50, 136: 50, 144: 73.8, 152: 70.5,
		160: 62.2, 168: 60, 176: 92.5,
	} {
		putF64(fieldOffset, value)
	}
	binary.LittleEndian.PutUint64(out[off+184:off+192], 0b1001)
	return out
}

func catalogRankingInputForClientTest() CatalogRankingV01Input {
	return CatalogRankingV01Input{
		Catalogs: []CatalogRankingEntityV01{{
			CatalogKey: 11, PeerGroupKey: 3, ApplicableQueryCount: 2,
			CurrentCompletedQueries: 2, PreviousCompletedQueries: 2,
			CurrentSessionCoverages: []float64{90, 95},
		}},
		Observations: []CatalogRankingObservationV01{{
			CatalogKey: 11, ProductKey: 1, AuthorKey: 501, HasAuthor: true,
			QueryKey: 101, WindowBucket: RankingWindowCurrent, Reliability: 0.9,
		}},
		Memberships: []CatalogProductMembershipV01{{CatalogKey: 11, ProductKey: 1}},
		FirstSeen:   []CatalogProductFirstSeenV01{{ProductKey: 1, FirstSeenBucket: RankingWindowCurrent}},
		ProductResults: []ProductRankingV01ResultRow{{
			ProductKey: 1, DirectionCode: 4, ComparableHistory: true, RankVelocity: 2,
		}},
	}
}

func TestExecuteCatalogRankingV01RejectsMalformedBatchResults(t *testing.T) {
	validPayload := validCatalogRankingResultPayloadForTest()
	validOp := func(payload []byte) BatchOperationResult {
		return BatchOperationResult{SlotID: 1, OperationID: V2OpCatalogRankingV01, SchemaID: 1, Status: V2StatusOK, Payload: payload}
	}
	tests := []struct {
		name   string
		result AnalyticsBatchResult
		want   string
	}{
		{"missing result", AnalyticsBatchResult{}, "result"},
		{"wrong slot", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 99, OperationID: V2OpCatalogRankingV01, SchemaID: 1, Status: V2StatusOK, Payload: validPayload}}}, "slot"},
		{"wrong operation", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpProductRankingV01, SchemaID: 1, Status: V2StatusOK, Payload: validPayload}}}, "operation"},
		{"wrong schema", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpCatalogRankingV01, SchemaID: 2, Status: V2StatusOK, Payload: validPayload}}}, "schema"},
		{"non ok status", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpCatalogRankingV01, SchemaID: 1, Status: V2StatusInternalError}}}, "status"},
		{"truncated payload", AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(make([]byte, 15))}}, "payload"},
		{"header reserved", func() AnalyticsBatchResult {
			p := append([]byte(nil), validPayload...)
			p[12] = 1
			return AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(p)}}
		}(), "reserved"},
		{"row reserved", func() AnalyticsBatchResult {
			p := append([]byte(nil), validPayload...)
			p[16+37] = 1
			return AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(p)}}
		}(), "reserved"},
		{"invalid direction", func() AnalyticsBatchResult {
			p := append([]byte(nil), validPayload...)
			p[16+36] = 5
			return AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(p)}}
		}(), "direction"},
		{"unknown missing mask", func() AnalyticsBatchResult {
			p := append([]byte(nil), validPayload...)
			binary.LittleEndian.PutUint64(p[16+184:16+192], 1<<4)
			return AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(p)}}
		}(), "missing"},
		{"non finite numeric", func() AnalyticsBatchResult {
			p := append([]byte(nil), validPayload...)
			binary.LittleEndian.PutUint64(p[16+40:16+48], math.Float64bits(math.NaN()))
			return AnalyticsBatchResult{Operations: []BatchOperationResult{validOp(p)}}
		}(), "finite"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			executor := &fakeProductRankingExecutor{result: tt.result}
			_, err := ExecuteCatalogRankingV01(context.Background(), executor, catalogRankingInputForClientTest())
			if err == nil {
				t.Fatal("malformed catalog ranking result must be rejected")
			}
			if !strings.Contains(strings.ToLower(err.Error()), tt.want) {
				t.Fatalf("err=%q want substring=%q", err, tt.want)
			}
			if len(executor.seen.Operations) != 1 {
				t.Fatalf("adapter sent %d operations want=1", len(executor.seen.Operations))
			}
			op := executor.seen.Operations[0]
			if op.SlotID != 1 || op.OperationID != V2OpCatalogRankingV01 || op.SchemaID != 1 {
				t.Fatalf("request metadata=%+v", op)
			}
			if _, ok := op.Input.(CatalogRankingV01Input); !ok {
				t.Fatalf("request input type=%T", op.Input)
			}
		})
	}
}

func TestExecuteCatalogRankingV01PropagatesExecutorError(t *testing.T) {
	executor := &fakeProductRankingExecutor{err: errors.New("executor unavailable")}
	_, err := ExecuteCatalogRankingV01(context.Background(), executor, catalogRankingInputForClientTest())
	if err == nil || !strings.Contains(err.Error(), "executor unavailable") {
		t.Fatalf("err=%v", err)
	}
}

func TestExecuteCatalogRankingV01DecodesCanonicalResult(t *testing.T) {
	executor := &fakeProductRankingExecutor{result: AnalyticsBatchResult{Operations: []BatchOperationResult{{
		SlotID: 1, OperationID: V2OpCatalogRankingV01, SchemaID: 1, Status: V2StatusOK,
		Payload: validCatalogRankingResultPayloadForTest(), DurationMicros: 321,
	}}}}
	result, err := ExecuteCatalogRankingV01(context.Background(), executor, catalogRankingInputForClientTest())
	if err != nil {
		t.Fatalf("ExecuteCatalogRankingV01: %v", err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("rows=%d want=1", len(result.Rows))
	}
	row := result.Rows[0]
	if row.CatalogKey != 11 || row.ObservedProducts != 1 || row.ObservedAuthors != 1 || row.NewProducts != 1 || row.PreviousNewProducts != 0 || row.RisingProducts != 1 || row.NeutralProducts != 0 || row.FallingProducts != 0 || row.ComparableProducts != 1 || row.DirectionCode != 3 || row.MissingMask != 0b1001 {
		t.Fatalf("catalog row identity/counts=%+v", row)
	}
	for label, pair := range map[string][2]float64{
		"median_velocity": {row.MedianRankVelocity, 2}, "breadth": {row.ExposureBreadth, 100},
		"demand_percent": {row.DemandMomentumPercent, 100}, "demand_index": {row.DemandMomentumIndex, 75},
		"new_supply_percent": {row.NewSupplyVelocityPercent, 100}, "new_supply_index": {row.NewSupplyVelocityIndex, 75},
		"competition": {row.CompetitionAcceleration, 100}, "competition_index": {row.CompetitionMomentumIndex, 75},
		"author_concentration": {row.AuthorConcentration, 100}, "author_coverage": {row.AuthorAttributionCoverage, 100},
		"freshness": {row.FreshnessIndex, 100}, "relative": {row.RelativeStrength, 50}, "supply_gap": {row.SupplyGap, 50},
		"direction_index": {row.DirectionIndex, 73.8}, "trend": {row.TrendScore, 70.5}, "opportunity": {row.OpportunityScore, 62.2},
		"confidence": {row.Confidence, 60}, "coverage": {row.Coverage, 92.5},
	} {
		if math.Float64bits(pair[0]) != math.Float64bits(pair[1]) {
			t.Fatalf("%s got=%v want=%v", label, pair[0], pair[1])
		}
	}
}

func structuralInputForClientTest() StructuralIndexV01Input {
	return StructuralIndexV01Input{Segments: []StructuralSegmentEvidenceV01{{
		SegmentKey: 21, ParentKey: 2, LevelCode: 1, ObservedProducts: 40,
		DataQualityScore: 90, DataQualityGrade: 1,
	}}}
}

func validStructuralIndexResultPayloadForTest() []byte {
	const headerBytes, rowBytes, weightResultBytes, weightBytes = 24, 72, 32, 16
	out := make([]byte, headerBytes+rowBytes+weightResultBytes+weightBytes)
	binary.LittleEndian.PutUint64(out[0:8], 111)
	binary.LittleEndian.PutUint32(out[8:12], 1)
	binary.LittleEndian.PutUint32(out[12:16], 1)
	binary.LittleEndian.PutUint32(out[16:20], 1)
	off := headerBytes
	binary.LittleEndian.PutUint32(out[off:off+4], 21)
	binary.LittleEndian.PutUint32(out[off+4:off+8], 2)
	out[off+8], out[off+9], out[off+10], out[off+11] = 1, 0, 0, 1
	binary.LittleEndian.PutUint32(out[off+12:off+16], 40)
	put := func(o int, v float64) { binary.LittleEndian.PutUint64(out[off+o:off+o+8], math.Float64bits(v)) }
	put(16, 100)
	put(24, 100)
	put(32, 100)
	put(40, 0)
	put(48, 100)
	put(56, 90)
	put(64, 90)
	wr := headerBytes + rowBytes
	binary.LittleEndian.PutUint32(out[wr:wr+4], 2)
	binary.LittleEndian.PutUint32(out[wr+4:wr+8], 1)
	binary.LittleEndian.PutUint64(out[wr+8:wr+16], math.Float64bits(.5))
	binary.LittleEndian.PutUint64(out[wr+16:wr+24], math.Float64bits(1))
	binary.LittleEndian.PutUint32(out[wr+24:wr+28], 0)
	binary.LittleEndian.PutUint32(out[wr+28:wr+32], 1)
	w := wr + weightResultBytes
	binary.LittleEndian.PutUint32(out[w:w+4], 21)
	binary.LittleEndian.PutUint64(out[w+8:w+16], math.Float64bits(1))
	return out
}

func TestExecuteStructuralIndexV01RejectsMalformedResults(t *testing.T) {
	valid := validStructuralIndexResultPayloadForTest()
	operation := func(payload []byte) BatchOperationResult {
		return BatchOperationResult{SlotID: 1, OperationID: V2OpStructuralIndexV01, SchemaID: 1, Status: V2StatusOK, Payload: payload}
	}
	tests := []struct {
		name   string
		result AnalyticsBatchResult
		want   string
	}{
		{"missing", AnalyticsBatchResult{}, "result"},
		{"wrong slot", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 2, OperationID: V2OpStructuralIndexV01, SchemaID: 1, Status: V2StatusOK, Payload: valid}}}, "slot"},
		{"wrong op", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpProductRankingV01, SchemaID: 1, Status: V2StatusOK, Payload: valid}}}, "operation"},
		{"wrong schema", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpStructuralIndexV01, SchemaID: 2, Status: V2StatusOK, Payload: valid}}}, "schema"},
		{"status", AnalyticsBatchResult{Operations: []BatchOperationResult{{SlotID: 1, OperationID: V2OpStructuralIndexV01, SchemaID: 1, Status: V2StatusInternalError}}}, "status"},
		{"truncated", AnalyticsBatchResult{Operations: []BatchOperationResult{operation(valid[:23])}}, "payload"},
		{"header reserved", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[20] = 1
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "reserved"},
		{"bad level", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[24+8] = 6
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "level"},
		{"bad divergence", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[24+9] = 3
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "divergence"},
		{"bad stage", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[24+10] = 4
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "stage"},
		{"bad grade", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[24+11] = 0
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "grade"},
		{"nan", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			binary.LittleEndian.PutUint64(p[24+16:24+24], math.Float64bits(math.NaN()))
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "finite"},
		{"fallback mask", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			binary.LittleEndian.PutUint32(p[24+72+4:24+72+8], 2)
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "fallback"},
		{"weight reserved", func() AnalyticsBatchResult {
			p := append([]byte(nil), valid...)
			p[len(p)-12] = 1
			return AnalyticsBatchResult{Operations: []BatchOperationResult{operation(p)}}
		}(), "reserved"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			executor := &fakeProductRankingExecutor{result: tt.result}
			_, err := ExecuteStructuralIndexV01(context.Background(), executor, structuralInputForClientTest())
			if err == nil {
				t.Fatal("malformed structural result must fail")
			}
			if !strings.Contains(strings.ToLower(err.Error()), tt.want) {
				t.Fatalf("err=%q want=%q", err, tt.want)
			}
		})
	}
}

func TestExecuteStructuralIndexV01DecodesCanonicalResult(t *testing.T) {
	executor := &fakeProductRankingExecutor{result: AnalyticsBatchResult{Operations: []BatchOperationResult{{
		SlotID: 1, OperationID: V2OpStructuralIndexV01, SchemaID: 1, Status: V2StatusOK,
		Payload: validStructuralIndexResultPayloadForTest(),
	}}}}
	result, err := ExecuteStructuralIndexV01(context.Background(), executor, structuralInputForClientTest())
	if err != nil {
		t.Fatalf("ExecuteStructuralIndexV01: %v", err)
	}
	if len(result.Rows) != 1 || len(result.WeightResults) != 1 {
		t.Fatalf("result=%+v", result)
	}
	row := result.Rows[0]
	if row.SegmentKey != 21 || row.ParentKey != 2 || row.LevelCode != 1 || row.DivergenceStateCode != 0 || row.DirectionStageCode != 0 || row.DataQualityGrade != 1 || row.SampleSize != 40 {
		t.Fatalf("row=%+v", row)
	}
	for label, pair := range map[string][2]float64{"composition": {row.CompositionIndex, 100}, "volume": {row.VolumeWeightedValue, 100}, "equal": {row.EqualSectorValue, 100}, "coverage": {row.Coverage, 100}, "confidence": {row.Confidence, 90}, "quality": {row.DataQualityScore, 90}} {
		if math.Float64bits(pair[0]) != math.Float64bits(pair[1]) {
			t.Fatalf("%s got=%v want=%v", label, pair[0], pair[1])
		}
	}
	wr := result.WeightResults[0]
	if wr.ParentKey != 2 || wr.FallbackMask != 1 || len(wr.Weights) != 1 || wr.Weights[0].SegmentKey != 21 || math.Float64bits(wr.Weights[0].Weight) != math.Float64bits(1) {
		t.Fatalf("weights=%+v", wr)
	}
}

func TestExecuteStructuralIndexV01PropagatesExecutorError(t *testing.T) {
	executor := &fakeProductRankingExecutor{err: errors.New("structural executor unavailable")}
	_, err := ExecuteStructuralIndexV01(context.Background(), executor, structuralInputForClientTest())
	if err == nil || !strings.Contains(err.Error(), "structural executor unavailable") {
		t.Fatalf("err=%v", err)
	}
}
