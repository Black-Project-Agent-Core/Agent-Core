package analyticsengine

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestC31OperationIDsAreAdditiveAndStable(t *testing.T) {
	got := []V2OperationID{
		V2OpCompetitionAccelerationV02,
		V2OpDirectionalMomentumV02,
		V2OpPeerRelativeRankV02,
		V2OpAuthorConcentrationChangeV02,
		V2OpMovementDivergenceV02,
	}
	want := []V2OperationID{9, 10, 11, 12, 13}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("C3.1 operation[%d]=%d want=%d", i, got[i], want[i])
		}
	}
	if V2OpStructuralDirectionV01 != 8 {
		t.Fatalf("legacy operation 8 changed: %d", V2OpStructuralDirectionV01)
	}
}

func TestEncodeCompetitionAccelerationV02(t *testing.T) {
	payload, err := EncodeCompetitionAccelerationV02(CompetitionAccelerationV02Input{OlderCount: 80, PriorCount: 100, CurrentCount: 140}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 24 {
		t.Fatalf("len=%d want=24", len(payload))
	}
	if int64(binary.LittleEndian.Uint64(payload[0:8])) != 80 || int64(binary.LittleEndian.Uint64(payload[8:16])) != 100 || int64(binary.LittleEndian.Uint64(payload[16:24])) != 140 {
		t.Fatalf("payload=%x", payload)
	}
	if _, err := EncodeCompetitionAccelerationV02(CompetitionAccelerationV02Input{OlderCount: -1, PriorCount: 1, CurrentCount: 1}, nil); err == nil {
		t.Fatal("negative count must fail")
	}
}

func TestEncodeDirectionalMomentumV02(t *testing.T) {
	payload, err := EncodeDirectionalMomentumV02(DirectionalMomentumV02Input{Rising: 7, Neutral: 2, Falling: 1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 24 {
		t.Fatalf("len=%d want=24", len(payload))
	}
	if _, err := EncodeDirectionalMomentumV02(DirectionalMomentumV02Input{Rising: 0, Neutral: 0, Falling: 0}, nil); err == nil {
		t.Fatal("zero comparable products must fail")
	}
}

func TestEncodePeerRelativeRankV02(t *testing.T) {
	payload, err := EncodePeerRelativeRankV02(PeerRelativeRankV02Input{SubjectIndex: 1, Values: []float64{-20, 10, 10, 80}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 48 {
		t.Fatalf("len=%d want=48", len(payload))
	}
	if binary.LittleEndian.Uint32(payload[0:4]) != 4 || binary.LittleEndian.Uint32(payload[4:8]) != 1 {
		t.Fatalf("header=%x", payload[:16])
	}
	if _, err := EncodePeerRelativeRankV02(PeerRelativeRankV02Input{SubjectIndex: 0, Values: []float64{10}}, nil); err == nil {
		t.Fatal("single-member peer group must fail")
	}
	if _, err := EncodePeerRelativeRankV02(PeerRelativeRankV02Input{SubjectIndex: 2, Values: []float64{10, 20}}, nil); err == nil {
		t.Fatal("out-of-range subject must fail")
	}
}

func TestEncodeAuthorConcentrationChangeV02(t *testing.T) {
	payload, err := EncodeAuthorConcentrationChangeV02(AuthorConcentrationChangeV02Input{Prior: 31.25, Current: 27.5}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 16 {
		t.Fatalf("len=%d want=16", len(payload))
	}
	if math.Float64frombits(binary.LittleEndian.Uint64(payload[:8])) != 31.25 || math.Float64frombits(binary.LittleEndian.Uint64(payload[8:])) != 27.5 {
		t.Fatalf("payload=%x", payload)
	}
}

func TestEncodeMovementDivergenceV02(t *testing.T) {
	payload, err := EncodeMovementDivergenceV02(MovementDivergenceV02Input{
		TotalChildCount: 4,
		Children:        []MovementChildV02{{Value: 50, ProductMass: 10}, {Value: -10, ProductMass: 30}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 48 {
		t.Fatalf("len=%d want=48", len(payload))
	}
	if binary.LittleEndian.Uint32(payload[0:4]) != 2 || binary.LittleEndian.Uint32(payload[4:8]) != 4 {
		t.Fatalf("header=%x", payload[:16])
	}
	if _, err := EncodeMovementDivergenceV02(MovementDivergenceV02Input{TotalChildCount: 1}, nil); err == nil {
		t.Fatal("empty child set must fail")
	}
	if _, err := EncodeMovementDivergenceV02(MovementDivergenceV02Input{TotalChildCount: 1, Children: []MovementChildV02{{Value: 1, ProductMass: 0}}}, nil); err == nil {
		t.Fatal("non-positive product mass must fail")
	}
}

func TestDecodeC31ResultsRejectMalformedPayloads(t *testing.T) {
	if _, err := DecodeCompetitionAccelerationV02Result(make([]byte, 39)); err == nil {
		t.Fatal("acceleration length")
	}
	if _, err := DecodeDirectionalMomentumV02Result(make([]byte, 31)); err == nil {
		t.Fatal("momentum length")
	}
	if _, err := DecodePeerRelativeRankV02Result(make([]byte, 23)); err == nil {
		t.Fatal("prr length")
	}
	if _, err := DecodeAuthorConcentrationChangeV02Result(make([]byte, 15)); err == nil {
		t.Fatal("author change length")
	}
	if _, err := DecodeMovementDivergenceV02Result(make([]byte, 63)); err == nil {
		t.Fatal("movement length")
	}
}
