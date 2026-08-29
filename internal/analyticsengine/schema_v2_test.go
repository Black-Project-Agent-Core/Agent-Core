package analyticsengine

import (
	"encoding/binary"
	"encoding/hex"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestEncodeSelectionProbabilityV2Golden(t *testing.T) {
	in := SelectionProbabilityInput{Observations: []SelectionObservation{
		{Weight: 2, Selected: true},
		{Weight: 1, Selected: false},
		{Weight: 3, Selected: true},
	}}
	got, err := EncodeSelectionProbabilityV2(in, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantHex := "03000000010000000000000000000040000000000000f03f00000000000008400500000000000000"
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("payload=%x", got)
	}
}

func TestEncodeItemVolatilityV2Golden(t *testing.T) {
	v2, v28, v3 := 2, 28, 3
	in := ItemVolatilityInput{
		Ranks:                  []*int{&v2, nil, &v28, &v3, nil},
		TopK:                   100,
		ConsecutiveAppearances: 3,
		EligibleSnapshots:      5,
		RBOToPrevious:          73.25,
	}
	got, err := EncodeItemVolatilityV2(in, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantHex := "05000000010000006400000000000000030000000000000005000000000000000000000000505240020000000000000000000000000000001c00000000000000030000000000000000000000000000000d00000000000000"
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("payload=%x", got)
	}
}

func TestEncodeClusterVolatilityV2Golden(t *testing.T) {
	in := ClusterVolatilityInput{
		Shares:               []float64{10, 12, 11, 9},
		ContextDisagreement:  20,
		CrossTimePersistence: 75,
	}
	got, err := EncodeClusterVolatilityV2(in, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantHex := "040000000000000000000000000034400000000000c052400000000000002440000000000000284000000000000026400000000000002240"
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("payload=%x", got)
	}
}

func TestEncodeDistributionSimilarityV2GoldenAndOrderInvariant(t *testing.T) {
	first := DistributionSimilarityInput{
		A: map[string]float64{"b": 1, "a": 2},
		B: map[string]float64{"c": 2, "a": 1},
	}
	second := DistributionSimilarityInput{
		A: map[string]float64{"a": 2, "b": 1},
		B: map[string]float64{"a": 1, "c": 2},
	}
	got, err := EncodeDistributionSimilarityV2(first, nil)
	if err != nil {
		t.Fatal(err)
	}
	gotSecond, err := EncodeDistributionSimilarityV2(second, nil)
	if err != nil {
		t.Fatal(err)
	}
	wantHex := "03000000030000000000000001000000020000000300000061626300000000000000000000000040000000000000f03f0000000000000000000000000000f03f00000000000000000000000000000040"
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("payload=%x", got)
	}
	if hex.EncodeToString(gotSecond) != wantHex {
		t.Fatalf("map insertion order changed payload=%x", gotSecond)
	}
}

func TestDecodeDistributionSimilarityResultV2Golden(t *testing.T) {
	payload, err := hex.DecodeString("7b000000000000000000000000c04640")
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeDistributionSimilarityResultV2(payload)
	if err != nil {
		t.Fatal(err)
	}
	if got.Score != 45.5 {
		t.Fatalf("result=%+v", got)
	}
}

func TestDecodeVolatilityResultV2Golden(t *testing.T) {
	payload, err := hex.DecodeString("c80100000000000001000000000000000000000000404640000000000080284000000000000016400000000000001b4000000000000054400000000000c05240")
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeVolatilityResultV2(payload)
	if err != nil {
		t.Fatal(err)
	}
	want := VolatilityResult{
		Score:                   44.5,
		Label:                   "variable",
		RankVariance:            12.25,
		AbsenceRate:             5.5,
		MedianAbsoluteDeviation: 6.75,
		RBOPersistence:          80,
		ConsecutivePersistence:  75,
	}
	if got != want {
		t.Fatalf("result=%+v want=%+v", got, want)
	}
}

func TestDecodeSelectionProbabilityResultV2Golden(t *testing.T) {
	payload, err := hex.DecodeString("15030000000000005555555555d554400000000000001440000000000000184002000000000000000300000000000000")
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeSelectionProbabilityResultV2(payload)
	if err != nil {
		t.Fatal(err)
	}
	if got.Score != 83.33333333333333 || got.SelectedWeight != 5 || got.EligibleWeight != 6 || got.SelectedCount != 2 || got.EligibleCount != 3 {
		t.Fatalf("result=%+v", got)
	}
}

func TestV2ResultDecodersRejectMalformedPayloads(t *testing.T) {
	if _, err := DecodeDistributionSimilarityResultV2(make([]byte, 15)); err == nil {
		t.Fatal("short distribution result must fail")
	}
	if _, err := DecodeDistributionSimilarityResultV2(make([]byte, 17)); err == nil {
		t.Fatal("trailing distribution result bytes must fail")
	}
	vol := make([]byte, 64)
	vol[8] = 4
	if _, err := DecodeVolatilityResultV2(vol); err == nil {
		t.Fatal("unknown volatility label must fail")
	}
	if _, err := DecodeVolatilityResultV2(make([]byte, 56)); err == nil {
		t.Fatal("56-byte volatility result is incomplete; canonical v2 schema is 64 bytes")
	}
}

func TestEncodeV2AnalyticsRequestPreservesOperationOrderAndAlignsPayloads(t *testing.T) {
	dist, err := EncodeDistributionSimilarityV2(DistributionSimilarityInput{
		A: map[string]float64{"a": 2, "b": 1},
		B: map[string]float64{"a": 1, "c": 2},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	itemRank := 5
	item, err := EncodeItemVolatilityV2(ItemVolatilityInput{
		Ranks: []*int{&itemRank, nil}, TopK: 10, ConsecutiveAppearances: 1, EligibleSnapshots: 2, RBOToPrevious: 80,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	cluster, err := EncodeClusterVolatilityV2(ClusterVolatilityInput{
		Shares: []float64{10, 12}, ContextDisagreement: 20, CrossTimePersistence: 75,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	selection, err := EncodeSelectionProbabilityV2(SelectionProbabilityInput{Observations: []SelectionObservation{
		{Weight: 2, Selected: true}, {Weight: 1, Selected: false}, {Weight: 3, Selected: true},
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	ops := []V2EncodedOperation{
		{Descriptor: V2OperationDescriptor{SlotID: 11, OperationID: V2OpDistributionSimilarity, SchemaID: 1}, Payload: dist},
		{Descriptor: V2OperationDescriptor{SlotID: 12, OperationID: V2OpItemVolatility, SchemaID: 1}, Payload: item},
		{Descriptor: V2OperationDescriptor{SlotID: 13, OperationID: V2OpClusterVolatility, SchemaID: 1}, Payload: cluster},
		{Descriptor: V2OperationDescriptor{SlotID: 14, OperationID: V2OpSelectionProbability, SchemaID: 1}, Payload: selection},
	}
	frame, err := EncodeV2AnalyticsRequest(99, ops, nil)
	if err != nil {
		t.Fatal(err)
	}
	h, err := DecodeV2Header(frame)
	if err != nil {
		t.Fatal(err)
	}
	if h.RequestID != 99 || h.OperationCount != 4 || h.MessageType != V2MessageAnalyticsRequest {
		t.Fatalf("header=%+v", h)
	}
	payloadStart := V2HeaderBytes + 4*V2OperationDescriptorBytes
	for i, op := range ops {
		start := V2HeaderBytes + i*V2OperationDescriptorBytes
		d, err := DecodeV2Descriptor(frame[start : start+V2OperationDescriptorBytes])
		if err != nil {
			t.Fatal(err)
		}
		if d.SlotID != op.Descriptor.SlotID || d.OperationID != op.Descriptor.OperationID || d.SchemaID != op.Descriptor.SchemaID {
			t.Fatalf("descriptor[%d]=%+v", i, d)
		}
		if d.PayloadOffset%8 != 0 {
			t.Fatalf("descriptor[%d] offset=%d is not aligned", i, d.PayloadOffset)
		}
		gotPayload := frame[payloadStart+int(d.PayloadOffset) : payloadStart+int(d.PayloadOffset+d.PayloadLength)]
		if hex.EncodeToString(gotPayload) != hex.EncodeToString(op.Payload) {
			t.Fatalf("payload[%d] mismatch", i)
		}
	}
}

func TestEncodeSelectionProbabilityV2RejectsInvalidWeights(t *testing.T) {
	cases := []SelectionProbabilityInput{
		{},
		{Observations: []SelectionObservation{{Weight: 0, Selected: true}}},
		{Observations: []SelectionObservation{{Weight: -1, Selected: true}}},
		{Observations: []SelectionObservation{{Weight: math.NaN(), Selected: true}}},
		{Observations: []SelectionObservation{{Weight: math.Inf(1), Selected: true}}},
	}
	for i, in := range cases {
		if _, err := EncodeSelectionProbabilityV2(in, nil); err == nil {
			t.Fatalf("case %d must fail", i)
		}
	}
}

func TestEncodeDistributionSimilarityV2RejectsInvalidUTF8Key(t *testing.T) {
	bad := string([]byte{0xff})
	if _, err := EncodeDistributionSimilarityV2(DistributionSimilarityInput{A: map[string]float64{bad: 1}}, nil); err == nil {
		t.Fatal("invalid UTF-8 key must fail")
	}
}

func TestV2ResultDecodersRejectTrailingBytesAndCountOverflow(t *testing.T) {
	if _, err := DecodeVolatilityResultV2(make([]byte, 65)); err == nil {
		t.Fatal("trailing volatility result bytes must fail")
	}
	if _, err := DecodeSelectionProbabilityResultV2(make([]byte, 49)); err == nil {
		t.Fatal("trailing selection result bytes must fail")
	}
	src := make([]byte, 48)
	binary.LittleEndian.PutUint64(src[32:40], ^uint64(0))
	if _, err := DecodeSelectionProbabilityResultV2(src); err == nil {
		t.Fatal("selection count overflow must fail")
	}
}

func TestEncodeV2AnalyticsRequestRejectsDuplicateSlotID(t *testing.T) {
	payload, err := EncodeSelectionProbabilityV2(SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	ops := []V2EncodedOperation{
		{Descriptor: V2OperationDescriptor{SlotID: 1, OperationID: V2OpSelectionProbability, SchemaID: 1}, Payload: payload},
		{Descriptor: V2OperationDescriptor{SlotID: 1, OperationID: V2OpSelectionProbability, SchemaID: 1}, Payload: payload},
	}
	if _, err := EncodeV2AnalyticsRequest(1, ops, nil); err == nil {
		t.Fatal("duplicate SlotID must fail")
	}
}

func TestEncodeV2AnalyticsRequestOneMillionCorpusFitsTarget(t *testing.T) {
	corpus := BuildDeterministicCorpus(1_000_000)
	dist, err := EncodeDistributionSimilarityV2(corpus.Distribution, nil)
	if err != nil {
		t.Fatal(err)
	}
	item, err := EncodeItemVolatilityV2(corpus.Item, nil)
	if err != nil {
		t.Fatal(err)
	}
	cluster, err := EncodeClusterVolatilityV2(corpus.Cluster, nil)
	if err != nil {
		t.Fatal(err)
	}
	selection, err := EncodeSelectionProbabilityV2(corpus.Selection, nil)
	if err != nil {
		t.Fatal(err)
	}
	frame, err := EncodeV2AnalyticsRequest(77, []V2EncodedOperation{
		{Descriptor: V2OperationDescriptor{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1}, Payload: dist},
		{Descriptor: V2OperationDescriptor{SlotID: 2, OperationID: V2OpItemVolatility, SchemaID: 1}, Payload: item},
		{Descriptor: V2OperationDescriptor{SlotID: 3, OperationID: V2OpClusterVolatility, SchemaID: 1}, Payload: cluster},
		{Descriptor: V2OperationDescriptor{SlotID: 4, OperationID: V2OpSelectionProbability, SchemaID: 1}, Payload: selection},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	const target = 64 << 20
	if len(frame) > target {
		t.Fatalf("1M encoded request=%d exceeds target=%d", len(frame), target)
	}
	if len(frame) >= 10<<20 {
		t.Fatalf("1M encoded request unexpectedly large=%d", len(frame))
	}
	t.Logf("1M encoded request bytes=%d", len(frame))
}

func TestV2FourOperationRequestFixtureMatchesEncoder(t *testing.T) {
	frame := buildTinyFourOpRequest(t, 3)
	want := readHexFixture(t, "analytics_request_four_ops.hex")
	if hex.EncodeToString(frame) != hex.EncodeToString(want) {
		t.Fatalf("request fixture mismatch\ngot =%x\nwant=%x", frame, want)
	}
}

func TestV2FourOperationResponseFixtureDecodes(t *testing.T) {
	frame := readHexFixture(t, "analytics_response_four_ops.hex")
	h, err := DecodeV2Header(frame)
	if err != nil {
		t.Fatal(err)
	}
	if h.MessageType != V2MessageAnalyticsResponse || h.RequestID != 3 || h.OperationCount != 4 {
		t.Fatalf("header=%+v", h)
	}
	payloadStart := V2HeaderBytes + int(h.DescriptorBytes)
	for i := 0; i < 4; i++ {
		start := V2HeaderBytes + i*V2OperationDescriptorBytes
		d, err := DecodeV2Descriptor(frame[start : start+V2OperationDescriptorBytes])
		if err != nil {
			t.Fatal(err)
		}
		if d.Status != V2StatusOK {
			t.Fatalf("descriptor[%d]=%+v", i, d)
		}
		payload := frame[payloadStart+int(d.PayloadOffset) : payloadStart+int(d.PayloadOffset+d.PayloadLength)]
		switch d.OperationID {
		case V2OpDistributionSimilarity:
			got, err := DecodeDistributionSimilarityResultV2(payload)
			if err != nil {
				t.Fatal(err)
			}
			if got.Score != 45.5 {
				t.Fatalf("distribution=%+v", got)
			}
		case V2OpItemVolatility:
			got, err := DecodeVolatilityResultV2(payload)
			if err != nil {
				t.Fatal(err)
			}
			if got.Label != "variable" || got.Score != 44.5 {
				t.Fatalf("item=%+v", got)
			}
		case V2OpClusterVolatility:
			got, err := DecodeVolatilityResultV2(payload)
			if err != nil {
				t.Fatal(err)
			}
			if got.Label != "stable" || got.Score != 14.25 {
				t.Fatalf("cluster=%+v", got)
			}
		case V2OpSelectionProbability:
			got, err := DecodeSelectionProbabilityResultV2(payload)
			if err != nil {
				t.Fatal(err)
			}
			if got.SelectedCount != 2 || got.EligibleCount != 3 || got.SelectedWeight != 5 || got.EligibleWeight != 6 {
				t.Fatalf("selection=%+v", got)
			}
		default:
			t.Fatalf("unexpected operation id=%d", d.OperationID)
		}
	}
}

func buildTinyFourOpRequest(t *testing.T, requestID uint64) []byte {
	t.Helper()
	dist, err := EncodeDistributionSimilarityV2(DistributionSimilarityInput{A: map[string]float64{"a": 2, "b": 1}, B: map[string]float64{"a": 1, "c": 2}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	rank := 5
	item, err := EncodeItemVolatilityV2(ItemVolatilityInput{Ranks: []*int{&rank, nil}, TopK: 10, ConsecutiveAppearances: 1, EligibleSnapshots: 2, RBOToPrevious: 80}, nil)
	if err != nil {
		t.Fatal(err)
	}
	cluster, err := EncodeClusterVolatilityV2(ClusterVolatilityInput{Shares: []float64{10, 12}, ContextDisagreement: 20, CrossTimePersistence: 75}, nil)
	if err != nil {
		t.Fatal(err)
	}
	selection, err := EncodeSelectionProbabilityV2(SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 2, Selected: true}, {Weight: 1}, {Weight: 3, Selected: true}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	frame, err := EncodeV2AnalyticsRequest(requestID, []V2EncodedOperation{
		{Descriptor: V2OperationDescriptor{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1}, Payload: dist},
		{Descriptor: V2OperationDescriptor{SlotID: 2, OperationID: V2OpItemVolatility, SchemaID: 1}, Payload: item},
		{Descriptor: V2OperationDescriptor{SlotID: 3, OperationID: V2OpClusterVolatility, SchemaID: 1}, Payload: cluster},
		{Descriptor: V2OperationDescriptor{SlotID: 4, OperationID: V2OpSelectionProbability, SchemaID: 1}, Payload: selection},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

func readHexFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("..", "..", "testdata", "analytics_v2", name)
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := hex.DecodeString(string(bytesTrimSpace(b)))
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}

func bytesTrimSpace(b []byte) []byte {
	start, end := 0, len(b)
	for start < end && (b[start] == ' ' || b[start] == '\n' || b[start] == '\r' || b[start] == '\t') {
		start++
	}
	for end > start && (b[end-1] == ' ' || b[end-1] == '\n' || b[end-1] == '\r' || b[end-1] == '\t') {
		end--
	}
	return b[start:end]
}
