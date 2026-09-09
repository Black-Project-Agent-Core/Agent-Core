package analyticsengine

import (
	"encoding/binary"
	"errors"
	"math"
)

type CompetitionAccelerationV02Input struct {
	OlderCount   int64
	PriorCount   int64
	CurrentCount int64
}

type CompetitionAccelerationV02Result struct {
	DurationMicros       uint64
	PreviousDeltaPercent float64
	CurrentDeltaPercent  float64
	Acceleration         float64
	ZeroBaselineFlags    uint32
}

type DirectionalMomentumV02Input struct {
	Rising  int64
	Neutral int64
	Falling int64
}

type DirectionalMomentumV02Result struct {
	DurationMicros     uint64
	ODMI               float64
	MomentumMagnitude  float64
	ComparableProducts uint64
}

type PeerRelativeRankV02Input struct {
	SubjectIndex uint32
	Values       []float64
}

type PeerRelativeRankV02Result struct {
	DurationMicros uint64
	Percentile     float64
	PeerGroupSize  uint64
}

type AuthorConcentrationChangeV02Input struct {
	Prior   float64
	Current float64
}

type AuthorConcentrationChangeV02Result struct {
	DurationMicros uint64
	Change         float64
}

type MovementChildV02 struct {
	Value       float64
	ProductMass float64
}

type MovementDivergenceV02Input struct {
	TotalChildCount uint32
	Children        []MovementChildV02
}

type MovementDivergenceV02Result struct {
	DurationMicros               uint64
	ProductMassWeighted          float64
	EqualSegment                 float64
	SignedDivergence             float64
	DivergenceMagnitude          float64
	SegmentMovementParticipation float64
	EligibleChildCount           uint64
	TotalChildCount              uint64
}

func EncodeCompetitionAccelerationV02(in CompetitionAccelerationV02Input, dst []byte) ([]byte, error) {
	if in.OlderCount < 0 || in.PriorCount < 0 || in.CurrentCount < 0 {
		return nil, errors.New("competition acceleration counts must be non-negative")
	}
	out := resizeV2Buffer(dst, 24)
	binary.LittleEndian.PutUint64(out[0:8], uint64(in.OlderCount))
	binary.LittleEndian.PutUint64(out[8:16], uint64(in.PriorCount))
	binary.LittleEndian.PutUint64(out[16:24], uint64(in.CurrentCount))
	return out, nil
}

func EncodeDirectionalMomentumV02(in DirectionalMomentumV02Input, dst []byte) ([]byte, error) {
	if in.Rising < 0 || in.Neutral < 0 || in.Falling < 0 {
		return nil, errors.New("directional momentum counts must be non-negative")
	}
	if in.Rising+in.Neutral+in.Falling <= 0 {
		return nil, errors.New("directional momentum requires comparable products")
	}
	out := resizeV2Buffer(dst, 24)
	binary.LittleEndian.PutUint64(out[0:8], uint64(in.Rising))
	binary.LittleEndian.PutUint64(out[8:16], uint64(in.Neutral))
	binary.LittleEndian.PutUint64(out[16:24], uint64(in.Falling))
	return out, nil
}

func EncodePeerRelativeRankV02(in PeerRelativeRankV02Input, dst []byte) ([]byte, error) {
	if len(in.Values) < 2 {
		return nil, errors.New("peer relative rank requires at least two peer values")
	}
	if uint64(len(in.Values)) > uint64(^uint32(0)) {
		return nil, errors.New("peer relative rank peer count exceeds schema limit")
	}
	if uint64(in.SubjectIndex) >= uint64(len(in.Values)) {
		return nil, errors.New("peer relative rank subject index is out of range")
	}
	for _, value := range in.Values {
		if !finiteV02(value) {
			return nil, errors.New("peer relative rank values must be finite")
		}
	}
	valuesBytes, ok := checkedMulInt(len(in.Values), 8)
	if !ok {
		return nil, errors.New("peer relative rank payload size overflow")
	}
	payloadBytes, ok := checkedAddInt(16, valuesBytes)
	if !ok {
		return nil, errors.New("peer relative rank payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Values)))
	binary.LittleEndian.PutUint32(out[4:8], in.SubjectIndex)
	for i, value := range in.Values {
		binary.LittleEndian.PutUint64(out[16+i*8:16+(i+1)*8], math.Float64bits(value))
	}
	return out, nil
}

func EncodeAuthorConcentrationChangeV02(in AuthorConcentrationChangeV02Input, dst []byte) ([]byte, error) {
	if !finiteV02(in.Prior) || !finiteV02(in.Current) {
		return nil, errors.New("author concentration values must be finite")
	}
	if in.Prior < 0 || in.Prior > 100 || in.Current < 0 || in.Current > 100 {
		return nil, errors.New("author concentration values must be within 0..100")
	}
	out := resizeV2Buffer(dst, 16)
	binary.LittleEndian.PutUint64(out[0:8], math.Float64bits(in.Prior))
	binary.LittleEndian.PutUint64(out[8:16], math.Float64bits(in.Current))
	return out, nil
}

func EncodeMovementDivergenceV02(in MovementDivergenceV02Input, dst []byte) ([]byte, error) {
	if len(in.Children) == 0 {
		return nil, errors.New("movement divergence requires movement-eligible children")
	}
	if uint64(len(in.Children)) > uint64(^uint32(0)) {
		return nil, errors.New("movement divergence child count exceeds schema limit")
	}
	if in.TotalChildCount < uint32(len(in.Children)) || in.TotalChildCount == 0 {
		return nil, errors.New("movement divergence total child count is invalid")
	}
	for _, child := range in.Children {
		if !finiteV02(child.Value) || !finiteV02(child.ProductMass) {
			return nil, errors.New("movement divergence child values must be finite")
		}
		if child.ProductMass <= 0 {
			return nil, errors.New("movement divergence product mass must be positive")
		}
	}
	childrenBytes, ok := checkedMulInt(len(in.Children), 16)
	if !ok {
		return nil, errors.New("movement divergence payload size overflow")
	}
	payloadBytes, ok := checkedAddInt(16, childrenBytes)
	if !ok {
		return nil, errors.New("movement divergence payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Children)))
	binary.LittleEndian.PutUint32(out[4:8], in.TotalChildCount)
	for i, child := range in.Children {
		off := 16 + i*16
		binary.LittleEndian.PutUint64(out[off:off+8], math.Float64bits(child.Value))
		binary.LittleEndian.PutUint64(out[off+8:off+16], math.Float64bits(child.ProductMass))
	}
	return out, nil
}

func DecodeCompetitionAccelerationV02Result(src []byte) (CompetitionAccelerationV02Result, error) {
	if len(src) != 40 {
		return CompetitionAccelerationV02Result{}, errors.New("competition acceleration v0.2 result must be exactly 40 bytes")
	}
	if binary.LittleEndian.Uint32(src[36:40]) != 0 {
		return CompetitionAccelerationV02Result{}, errors.New("competition acceleration v0.2 reserved result bytes must be zero")
	}
	result := CompetitionAccelerationV02Result{
		DurationMicros:       binary.LittleEndian.Uint64(src[0:8]),
		PreviousDeltaPercent: math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
		CurrentDeltaPercent:  math.Float64frombits(binary.LittleEndian.Uint64(src[16:24])),
		Acceleration:         math.Float64frombits(binary.LittleEndian.Uint64(src[24:32])),
		ZeroBaselineFlags:    binary.LittleEndian.Uint32(src[32:36]),
	}
	if !finiteV02(result.PreviousDeltaPercent) || !finiteV02(result.CurrentDeltaPercent) || !finiteV02(result.Acceleration) || result.ZeroBaselineFlags&^uint32(3) != 0 {
		return CompetitionAccelerationV02Result{}, errors.New("competition acceleration v0.2 result is invalid")
	}
	return result, nil
}

func DecodeDirectionalMomentumV02Result(src []byte) (DirectionalMomentumV02Result, error) {
	if len(src) != 32 {
		return DirectionalMomentumV02Result{}, errors.New("directional momentum v0.2 result must be exactly 32 bytes")
	}
	result := DirectionalMomentumV02Result{
		DurationMicros:     binary.LittleEndian.Uint64(src[0:8]),
		ODMI:               math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
		MomentumMagnitude:  math.Float64frombits(binary.LittleEndian.Uint64(src[16:24])),
		ComparableProducts: binary.LittleEndian.Uint64(src[24:32]),
	}
	if !finiteV02(result.ODMI) || !finiteV02(result.MomentumMagnitude) || result.ODMI < -100 || result.ODMI > 100 || result.MomentumMagnitude < 0 || result.MomentumMagnitude > 100 || result.ComparableProducts == 0 {
		return DirectionalMomentumV02Result{}, errors.New("directional momentum v0.2 result is invalid")
	}
	return result, nil
}

func DecodePeerRelativeRankV02Result(src []byte) (PeerRelativeRankV02Result, error) {
	if len(src) != 24 {
		return PeerRelativeRankV02Result{}, errors.New("peer relative rank v0.2 result must be exactly 24 bytes")
	}
	result := PeerRelativeRankV02Result{
		DurationMicros: binary.LittleEndian.Uint64(src[0:8]),
		Percentile:     math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
		PeerGroupSize:  binary.LittleEndian.Uint64(src[16:24]),
	}
	if !finiteV02(result.Percentile) || result.Percentile < 0 || result.Percentile > 100 || result.PeerGroupSize < 2 {
		return PeerRelativeRankV02Result{}, errors.New("peer relative rank v0.2 result is invalid")
	}
	return result, nil
}

func DecodeAuthorConcentrationChangeV02Result(src []byte) (AuthorConcentrationChangeV02Result, error) {
	if len(src) != 16 {
		return AuthorConcentrationChangeV02Result{}, errors.New("author concentration change v0.2 result must be exactly 16 bytes")
	}
	result := AuthorConcentrationChangeV02Result{
		DurationMicros: binary.LittleEndian.Uint64(src[0:8]),
		Change:         math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
	}
	if !finiteV02(result.Change) || result.Change < -100 || result.Change > 100 {
		return AuthorConcentrationChangeV02Result{}, errors.New("author concentration change v0.2 result is invalid")
	}
	return result, nil
}

func DecodeMovementDivergenceV02Result(src []byte) (MovementDivergenceV02Result, error) {
	if len(src) != 64 {
		return MovementDivergenceV02Result{}, errors.New("movement divergence v0.2 result must be exactly 64 bytes")
	}
	result := MovementDivergenceV02Result{
		DurationMicros:               binary.LittleEndian.Uint64(src[0:8]),
		ProductMassWeighted:          math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
		EqualSegment:                 math.Float64frombits(binary.LittleEndian.Uint64(src[16:24])),
		SignedDivergence:             math.Float64frombits(binary.LittleEndian.Uint64(src[24:32])),
		DivergenceMagnitude:          math.Float64frombits(binary.LittleEndian.Uint64(src[32:40])),
		SegmentMovementParticipation: math.Float64frombits(binary.LittleEndian.Uint64(src[40:48])),
		EligibleChildCount:           binary.LittleEndian.Uint64(src[48:56]),
		TotalChildCount:              binary.LittleEndian.Uint64(src[56:64]),
	}
	for _, value := range []float64{result.ProductMassWeighted, result.EqualSegment, result.SignedDivergence, result.DivergenceMagnitude, result.SegmentMovementParticipation} {
		if !finiteV02(value) {
			return MovementDivergenceV02Result{}, errors.New("movement divergence v0.2 result is invalid")
		}
	}
	if result.EligibleChildCount == 0 || result.TotalChildCount < result.EligibleChildCount || result.SegmentMovementParticipation < 0 || result.SegmentMovementParticipation > 100 || result.DivergenceMagnitude < 0 {
		return MovementDivergenceV02Result{}, errors.New("movement divergence v0.2 result is invalid")
	}
	return result, nil
}

func finiteV02(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
