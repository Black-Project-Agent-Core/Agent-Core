package analyticsengine

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

func TestRankingV01BatchEncodesOperationDescriptors(t *testing.T) {
	batch := AnalyticsBatch{Operations: []BatchOperation{
		{
			SlotID:      51,
			OperationID: V2OpProductRankingV01,
			SchemaID:    1,
			Input: ProductRankingV01Input{
				Products: []ProductRankingEntityV01{{
					ProductKey:          1,
					CatalogKey:          11,
					FirstSeenBucket:     RankingWindowCurrent,
					ApplicableQueryKeys: []uint32{101, 102},
					SessionCoverages:    []float64{80, 100},
				}},
				Observations: []ProductRankingObservationV01{{
					ProductKey:   1,
					WindowBucket: RankingWindowCurrent,
					QueryKey:     101,
					SurfaceCode:  1,
					Position:     7,
					Reliability:  0.9,
				}},
			},
		},
		{
			SlotID:      52,
			OperationID: V2OpCatalogRankingV01,
			SchemaID:    1,
			Input: CatalogRankingV01Input{
				Catalogs: []CatalogRankingEntityV01{{
					CatalogKey:               11,
					PeerGroupKey:             3,
					ApplicableQueryCount:     2,
					CurrentCompletedQueries:  2,
					PreviousCompletedQueries: 2,
					CurrentSessionCoverages:  []float64{90},
				}},
			},
		},
		{
			SlotID:      53,
			OperationID: V2OpStructuralIndexV01,
			SchemaID:    1,
			Input: StructuralIndexV01Input{
				Segments: []StructuralSegmentEvidenceV01{{
					SegmentKey:       21,
					ParentKey:        2,
					LevelCode:        1,
					ObservedProducts: 40,
					DataQualityScore: 90,
					DataQualityGrade: 1,
				}},
			},
		},
		{
			SlotID:      54,
			OperationID: V2OpStructuralDirectionV01,
			SchemaID:    1,
			Input: StructuralDirectionV01Input{Rows: []StructuralDirectionV01InputRow{{
				RowKey: 1, ComparableRuns: 2, CurrentVolume: 70, PriorVolume: 50,
				CurrentEqual: 68, PriorEqual: 52, BaseConfidence: 95,
			}}},
		},
	}}

	encoded, err := encodeAnalyticsBatchV2(901, batch, nil)
	if err != nil {
		t.Fatalf("ranking v0.1 batch encode failed: %v", err)
	}
	frame, err := readV2WireFrame(bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("decode encoded ranking batch: %v", err)
	}
	if len(frame.Descriptors) != 4 {
		t.Fatalf("descriptor count=%d want=4", len(frame.Descriptors))
	}
	wantSlots := []uint32{51, 52, 53, 54}
	wantOps := []V2OperationID{V2OpProductRankingV01, V2OpCatalogRankingV01, V2OpStructuralIndexV01, V2OpStructuralDirectionV01}
	for i, descriptor := range frame.Descriptors {
		if descriptor.SlotID != wantSlots[i] || descriptor.OperationID != wantOps[i] || descriptor.SchemaID != 1 {
			t.Fatalf("descriptor[%d]=%+v", i, descriptor)
		}
		if descriptor.PayloadLength == 0 {
			t.Fatalf("descriptor[%d] has empty ranking payload", i)
		}
	}
}

func TestRankingV01HostHandshakeRequiresRankingCapabilities(t *testing.T) {
	legacyOnly := encodeHandshakeResponseForRankingTest([][2]uint16{
		{1, 1}, {2, 1}, {3, 1}, {4, 1},
	})
	if _, err := validateV2HandshakeResponse(legacyOnly); err == nil || !strings.Contains(err.Error(), "missing required capability") {
		t.Fatalf("legacy-only worker capabilities must be rejected after C1 ranking cutover preparation; err=%v", err)
	}

	preC31 := encodeHandshakeResponseForRankingTest([][2]uint16{
		{1, 1}, {2, 1}, {3, 1}, {4, 1}, {5, 1}, {6, 1}, {7, 1}, {8, 1},
	})
	if _, err := validateV2HandshakeResponse(preC31); err == nil || !strings.Contains(err.Error(), "missing required capability") {
		t.Fatalf("worker missing C3.1 capabilities must be rejected; err=%v", err)
	}

	allRequired := encodeHandshakeResponseForRankingTest([][2]uint16{
		{1, 1}, {2, 1}, {3, 1}, {4, 1}, {5, 1}, {6, 1}, {7, 1}, {8, 1},
		{9, 1}, {10, 1}, {11, 1}, {12, 1}, {13, 1},
	})
	if _, err := validateV2HandshakeResponse(allRequired); err != nil {
		t.Fatalf("worker advertising all required v2 capabilities must pass: %v", err)
	}
}

func encodeHandshakeResponseForRankingTest(registry [][2]uint16) []byte {
	version := []byte("c1-test")
	rawLen := 24 + len(registry)*8 + len(version)
	alignedLen := (rawLen + 7) &^ 7
	payload := make([]byte, alignedLen)
	binary.LittleEndian.PutUint32(payload[0:4], v2HandshakeStatusOK)
	binary.LittleEndian.PutUint64(payload[8:16], V2MaxFrameBytes)
	binary.LittleEndian.PutUint32(payload[16:20], uint32(len(registry)))
	binary.LittleEndian.PutUint16(payload[20:22], uint16(len(version)))
	for i, pair := range registry {
		off := 24 + i*8
		binary.LittleEndian.PutUint16(payload[off:off+2], pair[0])
		binary.LittleEndian.PutUint16(payload[off+2:off+4], pair[1])
	}
	copy(payload[24+len(registry)*8:], version)
	return payload
}
