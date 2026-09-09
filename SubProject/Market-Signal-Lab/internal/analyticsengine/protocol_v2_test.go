package analyticsengine

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestV2HeaderGoldenVector(t *testing.T) {
	got := make([]byte, V2HeaderBytes)
	h := V2FrameHeader{
		ProtocolMajor:   2,
		ProtocolMinor:   0,
		MessageType:     V2MessageAnalyticsRequest,
		RequestID:       0x0102030405060708,
		OperationCount:  4,
		DescriptorBytes: 4 * V2OperationDescriptorBytes,
		PayloadBytes:    0x0000000000010203,
		TotalFrameBytes: V2HeaderBytes + 4*V2OperationDescriptorBytes + 0x10203,
	}
	if err := EncodeV2Header(got, h); err != nil {
		t.Fatal(err)
	}
	wantHex := "4d534c32020000000300000040000000080706050403020104000000800000000302010000000000c30201000000000000000000000000000000000000000000"
	if len(wantHex) != 128 {
		t.Fatalf("bad golden literal length=%d", len(wantHex))
	}
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("header=%x", got)
	}

	decoded, err := DecodeV2Header(got)
	if err != nil {
		t.Fatal(err)
	}
	want := h
	want.HeaderBytes = V2HeaderBytes
	if decoded != want {
		t.Fatalf("decoded=%+v want=%+v", decoded, want)
	}
}

func TestV2DescriptorGoldenVector(t *testing.T) {
	got := make([]byte, V2OperationDescriptorBytes)
	d := V2OperationDescriptor{
		SlotID:        0x01020304,
		OperationID:   V2OpSelectionProbability,
		SchemaID:      1,
		Flags:         0,
		Status:        V2StatusOK,
		PayloadOffset: 0x0102030405060708,
		PayloadLength: 0x1112131415161718,
	}
	if err := EncodeV2Descriptor(got, d); err != nil {
		t.Fatal(err)
	}
	wantHex := "0403020104000100000000000000000008070605040302011817161514131211"
	if hex.EncodeToString(got) != wantHex {
		t.Fatalf("descriptor=%x", got)
	}
	decoded, err := DecodeV2Descriptor(got)
	if err != nil {
		t.Fatal(err)
	}
	if decoded != d {
		t.Fatalf("decoded=%+v want=%+v", decoded, d)
	}
}

func TestDecodeV2HeaderRejectsInvalidStructure(t *testing.T) {
	base := make([]byte, V2HeaderBytes)
	h := V2FrameHeader{
		ProtocolMajor:   2,
		ProtocolMinor:   0,
		MessageType:     V2MessageAnalyticsRequest,
		RequestID:       1,
		OperationCount:  1,
		DescriptorBytes: V2OperationDescriptorBytes,
		PayloadBytes:    16,
		TotalFrameBytes: V2HeaderBytes + V2OperationDescriptorBytes + 16,
	}
	if err := EncodeV2Header(base, h); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name string
		mut  func([]byte)
	}{
		{name: "bad magic", mut: func(b []byte) { b[0] = 'X' }},
		{name: "bad major", mut: func(b []byte) { b[4] = 3 }},
		{name: "bad minor", mut: func(b []byte) { b[6] = 1 }},
		{name: "nonzero flags", mut: func(b []byte) { b[10] = 1 }},
		{name: "bad header bytes", mut: func(b []byte) { b[12] = 63 }},
		{name: "reserved nonzero", mut: func(b []byte) { b[48] = 1 }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			b := append([]byte(nil), base...)
			tc.mut(b)
			if _, err := DecodeV2Header(b); err == nil {
				t.Fatal("expected structural rejection")
			}
		})
	}
}

func TestValidateV2FrameLayoutAcceptsDisjointPayloads(t *testing.T) {
	h := validV2AnalyticsHeaderForTest(2, 64)
	ds := []V2OperationDescriptor{
		{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1, PayloadOffset: 0, PayloadLength: 32},
		{SlotID: 2, OperationID: V2OpSelectionProbability, SchemaID: 1, PayloadOffset: 32, PayloadLength: 32},
	}
	if err := ValidateV2FrameLayout(h, ds); err != nil {
		t.Fatal(err)
	}
}

func TestValidateV2FrameLayoutRejectsOverlap(t *testing.T) {
	h := validV2AnalyticsHeaderForTest(2, 64)
	ds := []V2OperationDescriptor{
		{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1, PayloadOffset: 0, PayloadLength: 40},
		{SlotID: 2, OperationID: V2OpSelectionProbability, SchemaID: 1, PayloadOffset: 32, PayloadLength: 32},
	}
	if err := ValidateV2FrameLayout(h, ds); err == nil {
		t.Fatal("overlap must fail")
	}
}

func TestValidateV2FrameLayoutRejectsDuplicateSlotAndRequestStatus(t *testing.T) {
	h := validV2AnalyticsHeaderForTest(2, 64)
	ds := []V2OperationDescriptor{
		{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1, PayloadOffset: 0, PayloadLength: 32},
		{SlotID: 1, OperationID: V2OpSelectionProbability, SchemaID: 1, PayloadOffset: 32, PayloadLength: 32},
	}
	if err := ValidateV2FrameLayout(h, ds); err == nil {
		t.Fatal("duplicate slot must fail")
	}

	ds[1].SlotID = 2
	ds[1].Status = V2StatusInvalidInput
	if err := ValidateV2FrameLayout(h, ds); err == nil {
		t.Fatal("request descriptor status must be zero")
	}
}

func TestValidateV2FrameLayoutRejectsOutOfBoundsAndTooManyOperations(t *testing.T) {
	h := validV2AnalyticsHeaderForTest(1, 16)
	ds := []V2OperationDescriptor{{SlotID: 1, OperationID: V2OpSelectionProbability, SchemaID: 1, PayloadOffset: 8, PayloadLength: 16}}
	if err := ValidateV2FrameLayout(h, ds); err == nil {
		t.Fatal("out-of-bounds payload must fail")
	}

	h = validV2AnalyticsHeaderForTest(V2MaxOperations+1, 0)
	if err := ValidateV2FrameLayout(h, make([]V2OperationDescriptor, V2MaxOperations+1)); err == nil {
		t.Fatal("operation count above hard maximum must fail")
	}
}

func validV2AnalyticsHeaderForTest(operationCount uint32, payloadBytes uint64) V2FrameHeader {
	return V2FrameHeader{
		ProtocolMajor:   2,
		ProtocolMinor:   0,
		MessageType:     V2MessageAnalyticsRequest,
		HeaderBytes:     V2HeaderBytes,
		RequestID:       1,
		OperationCount:  operationCount,
		DescriptorBytes: operationCount * V2OperationDescriptorBytes,
		PayloadBytes:    payloadBytes,
		TotalFrameBytes: uint64(V2HeaderBytes) + uint64(operationCount*V2OperationDescriptorBytes) + payloadBytes,
	}
}

func TestV2SharedStructuralFixtures(t *testing.T) {
	for _, tc := range []struct {
		name       string
		message    V2MessageType
		operations uint32
	}{
		{name: "handshake_request.hex", message: V2MessageHandshakeRequest},
		{name: "handshake_response.hex", message: V2MessageHandshakeResponse},
		{name: "analytics_request_four_ops.hex", message: V2MessageAnalyticsRequest, operations: 4},
		{name: "analytics_response_four_ops.hex", message: V2MessageAnalyticsResponse, operations: 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			frame := readV2HexFixture(t, tc.name)
			h, err := DecodeV2Header(frame)
			if err != nil {
				t.Fatal(err)
			}
			if h.MessageType != tc.message || h.OperationCount != tc.operations {
				t.Fatalf("header=%+v", h)
			}
			if uint64(len(frame)) != h.TotalFrameBytes {
				t.Fatalf("frame bytes=%d header=%d", len(frame), h.TotalFrameBytes)
			}
			if tc.operations == 0 {
				return
			}
			ds := make([]V2OperationDescriptor, tc.operations)
			for i := range ds {
				start := V2HeaderBytes + i*V2OperationDescriptorBytes
				d, err := DecodeV2Descriptor(frame[start : start+V2OperationDescriptorBytes])
				if err != nil {
					t.Fatal(err)
				}
				ds[i] = d
			}
			if err := ValidateV2FrameLayout(h, ds); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func readV2HexFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("..", "..", "testdata", "analytics_v2", name)
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	out, err := hex.DecodeString(strings.TrimSpace(string(b)))
	if err != nil {
		t.Fatal(err)
	}
	return out
}
