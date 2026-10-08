package analyticsengine

import (
	"encoding/binary"
	"errors"
	"math"
	"sort"
	"unicode/utf8"
)

func EncodeSelectionProbabilityV2(in SelectionProbabilityInput, dst []byte) ([]byte, error) {
	n := len(in.Observations)
	if n == 0 {
		return nil, errors.New("selection probability requires eligible observations")
	}
	if uint64(n) > uint64(^uint32(0)) {
		return nil, errors.New("selection observation count exceeds v2 schema limit")
	}
	bitsetBytes := (n + 7) / 8
	weightsBytes, ok := checkedMulInt(n, 8)
	if !ok {
		return nil, errors.New("selection payload size overflow")
	}
	payloadBytes, ok := checkedAddInt(8, weightsBytes)
	if !ok {
		return nil, errors.New("selection payload size overflow")
	}
	payloadBytes, ok = checkedAddInt(payloadBytes, bitsetBytes)
	if !ok {
		return nil, errors.New("selection payload size overflow")
	}
	payloadBytes, ok = align8Checked(payloadBytes)
	if !ok {
		return nil, errors.New("selection payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(n))
	binary.LittleEndian.PutUint32(out[4:8], uint32(bitsetBytes))
	weightsStart := 8
	bitsetStart := weightsStart + weightsBytes
	for i, observation := range in.Observations {
		if observation.Weight <= 0 || math.IsNaN(observation.Weight) || math.IsInf(observation.Weight, 0) {
			return nil, errors.New("selection observation weight must be positive")
		}
		binary.LittleEndian.PutUint64(out[weightsStart+i*8:weightsStart+(i+1)*8], math.Float64bits(observation.Weight))
		if observation.Selected {
			out[bitsetStart+i/8] |= byte(1 << uint(i&7))
		}
	}
	return out, nil
}

func EncodeItemVolatilityV2(in ItemVolatilityInput, dst []byte) ([]byte, error) {
	n := len(in.Ranks)
	if uint64(n) > uint64(^uint32(0)) {
		return nil, errors.New("item volatility rank count exceeds v2 schema limit")
	}
	validityBytes := (n + 7) / 8
	rankBytes, ok := checkedMulInt(n, 8)
	if !ok {
		return nil, errors.New("item volatility payload size overflow")
	}
	payloadBytes, ok := checkedAddInt(40, rankBytes)
	if !ok {
		return nil, errors.New("item volatility payload size overflow")
	}
	payloadBytes, ok = checkedAddInt(payloadBytes, validityBytes)
	if !ok {
		return nil, errors.New("item volatility payload size overflow")
	}
	payloadBytes, ok = align8Checked(payloadBytes)
	if !ok {
		return nil, errors.New("item volatility payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(n))
	binary.LittleEndian.PutUint32(out[4:8], uint32(validityBytes))
	binary.LittleEndian.PutUint64(out[8:16], uint64(int64(in.TopK)))
	binary.LittleEndian.PutUint64(out[16:24], uint64(int64(in.ConsecutiveAppearances)))
	binary.LittleEndian.PutUint64(out[24:32], uint64(int64(in.EligibleSnapshots)))
	binary.LittleEndian.PutUint64(out[32:40], math.Float64bits(in.RBOToPrevious))
	ranksStart := 40
	validityStart := ranksStart + rankBytes
	for i, rank := range in.Ranks {
		if rank == nil {
			continue
		}
		binary.LittleEndian.PutUint64(out[ranksStart+i*8:ranksStart+(i+1)*8], uint64(int64(*rank)))
		out[validityStart+i/8] |= byte(1 << uint(i&7))
	}
	return out, nil
}

func EncodeClusterVolatilityV2(in ClusterVolatilityInput, dst []byte) ([]byte, error) {
	n := len(in.Shares)
	if uint64(n) > uint64(^uint32(0)) {
		return nil, errors.New("cluster volatility share count exceeds v2 schema limit")
	}
	shareBytes, ok := checkedMulInt(n, 8)
	if !ok {
		return nil, errors.New("cluster volatility payload size overflow")
	}
	payloadBytes, ok := checkedAddInt(24, shareBytes)
	if !ok {
		return nil, errors.New("cluster volatility payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(n))
	binary.LittleEndian.PutUint32(out[4:8], 0)
	binary.LittleEndian.PutUint64(out[8:16], math.Float64bits(in.ContextDisagreement))
	binary.LittleEndian.PutUint64(out[16:24], math.Float64bits(in.CrossTimePersistence))
	for i, share := range in.Shares {
		binary.LittleEndian.PutUint64(out[24+i*8:24+(i+1)*8], math.Float64bits(share))
	}
	return out, nil
}

func EncodeDistributionSimilarityV2(in DistributionSimilarityInput, dst []byte) ([]byte, error) {
	keysMap := make(map[string]struct{}, len(in.A)+len(in.B))
	for key := range in.A {
		if !utf8.ValidString(key) {
			return nil, errors.New("distribution key must be valid utf-8")
		}
		keysMap[key] = struct{}{}
	}
	for key := range in.B {
		if !utf8.ValidString(key) {
			return nil, errors.New("distribution key must be valid utf-8")
		}
		keysMap[key] = struct{}{}
	}
	if uint64(len(keysMap)) > uint64(^uint32(0)) {
		return nil, errors.New("distribution key count exceeds v2 schema limit")
	}
	keys := make([]string, 0, len(keysMap))
	dictionaryBytes := 0
	for key := range keysMap {
		keys = append(keys, key)
		next, ok := checkedAddInt(dictionaryBytes, len(key))
		if !ok || uint64(next) > uint64(^uint32(0)) {
			return nil, errors.New("distribution dictionary exceeds v2 schema limit")
		}
		dictionaryBytes = next
	}
	sort.Strings(keys)
	offsetBytes, ok := checkedMulInt(len(keys)+1, 4)
	if !ok {
		return nil, errors.New("distribution offset table size overflow")
	}
	prefixBytes, ok := checkedAddInt(8, offsetBytes)
	if !ok {
		return nil, errors.New("distribution payload size overflow")
	}
	prefixBytes, ok = checkedAddInt(prefixBytes, dictionaryBytes)
	if !ok {
		return nil, errors.New("distribution payload size overflow")
	}
	arraysStart, ok := align8Checked(prefixBytes)
	if !ok {
		return nil, errors.New("distribution payload size overflow")
	}
	arrayBytes, ok := checkedMulInt(len(keys), 8)
	if !ok {
		return nil, errors.New("distribution value array size overflow")
	}
	payloadBytes, ok := checkedAddInt(arraysStart, arrayBytes)
	if !ok {
		return nil, errors.New("distribution payload size overflow")
	}
	payloadBytes, ok = checkedAddInt(payloadBytes, arrayBytes)
	if !ok {
		return nil, errors.New("distribution payload size overflow")
	}
	out := resizeV2Buffer(dst, payloadBytes)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(keys)))
	binary.LittleEndian.PutUint32(out[4:8], uint32(dictionaryBytes))
	offsetsStart := 8
	dictionaryStart := offsetsStart + offsetBytes
	offset := 0
	for i, key := range keys {
		binary.LittleEndian.PutUint32(out[offsetsStart+i*4:offsetsStart+(i+1)*4], uint32(offset))
		copy(out[dictionaryStart+offset:], key)
		offset += len(key)
	}
	binary.LittleEndian.PutUint32(out[offsetsStart+len(keys)*4:offsetsStart+(len(keys)+1)*4], uint32(offset))
	valuesAStart := arraysStart
	valuesBStart := arraysStart + arrayBytes
	for i, key := range keys {
		binary.LittleEndian.PutUint64(out[valuesAStart+i*8:valuesAStart+(i+1)*8], math.Float64bits(in.A[key]))
		binary.LittleEndian.PutUint64(out[valuesBStart+i*8:valuesBStart+(i+1)*8], math.Float64bits(in.B[key]))
	}
	return out, nil
}

func resizeV2Buffer(dst []byte, n int) []byte {
	if cap(dst) >= n {
		dst = dst[:n]
		clear(dst)
		return dst
	}
	return make([]byte, n)
}

func align8Checked(n int) (int, bool) {
	if n < 0 || n > int(^uint(0)>>1)-7 {
		return 0, false
	}
	return (n + 7) &^ 7, true
}

func checkedAddInt(a, b int) (int, bool) {
	if a < 0 || b < 0 || a > int(^uint(0)>>1)-b {
		return 0, false
	}
	return a + b, true
}

func checkedMulInt(a, b int) (int, bool) {
	if a < 0 || b < 0 {
		return 0, false
	}
	if a == 0 || b == 0 {
		return 0, true
	}
	if a > int(^uint(0)>>1)/b {
		return 0, false
	}
	return a * b, true
}

func DecodeDistributionSimilarityResultV2(src []byte) (DistributionSimilarityResult, error) {
	if len(src) != 16 {
		return DistributionSimilarityResult{}, errors.New("distribution similarity v2 result must be exactly 16 bytes")
	}
	return DistributionSimilarityResult{Score: math.Float64frombits(binary.LittleEndian.Uint64(src[8:16]))}, nil
}

func DecodeVolatilityResultV2(src []byte) (VolatilityResult, error) {
	if len(src) != 64 {
		return VolatilityResult{}, errors.New("volatility v2 result must be exactly 64 bytes")
	}
	labels := [...]string{"stable", "variable", "unstable", "extreme"}
	label := int(src[8])
	if label >= len(labels) {
		return VolatilityResult{}, errors.New("volatility v2 result label is unknown")
	}
	for _, b := range src[9:16] {
		if b != 0 {
			return VolatilityResult{}, errors.New("volatility v2 reserved result bytes must be zero")
		}
	}
	return VolatilityResult{
		Score:                   math.Float64frombits(binary.LittleEndian.Uint64(src[16:24])),
		Label:                   labels[label],
		RankVariance:            math.Float64frombits(binary.LittleEndian.Uint64(src[24:32])),
		AbsenceRate:             math.Float64frombits(binary.LittleEndian.Uint64(src[32:40])),
		MedianAbsoluteDeviation: math.Float64frombits(binary.LittleEndian.Uint64(src[40:48])),
		RBOPersistence:          math.Float64frombits(binary.LittleEndian.Uint64(src[48:56])),
		ConsecutivePersistence:  math.Float64frombits(binary.LittleEndian.Uint64(src[56:64])),
	}, nil
}

func DecodeSelectionProbabilityResultV2(src []byte) (SelectionProbabilityResult, error) {
	if len(src) != 48 {
		return SelectionProbabilityResult{}, errors.New("selection probability v2 result must be exactly 48 bytes")
	}
	selectedCount := binary.LittleEndian.Uint64(src[32:40])
	eligibleCount := binary.LittleEndian.Uint64(src[40:48])
	maxInt := uint64(^uint(0) >> 1)
	if selectedCount > maxInt || eligibleCount > maxInt {
		return SelectionProbabilityResult{}, errors.New("selection probability v2 result count exceeds platform int")
	}
	return SelectionProbabilityResult{
		Score:          math.Float64frombits(binary.LittleEndian.Uint64(src[8:16])),
		SelectedWeight: math.Float64frombits(binary.LittleEndian.Uint64(src[16:24])),
		EligibleWeight: math.Float64frombits(binary.LittleEndian.Uint64(src[24:32])),
		SelectedCount:  int(selectedCount),
		EligibleCount:  int(eligibleCount),
	}, nil
}

type V2EncodedOperation struct {
	Descriptor V2OperationDescriptor
	Payload    []byte
}

func EncodeV2AnalyticsRequest(requestID uint64, ops []V2EncodedOperation, dst []byte) ([]byte, error) {
	if requestID == 0 {
		return nil, errors.New("analytics v2 request id must be non-zero")
	}
	if len(ops) == 0 || uint64(len(ops)) > uint64(V2MaxOperations) {
		return nil, errors.New("analytics v2 operation count is invalid")
	}
	descriptorBytes, ok := checkedMulInt(len(ops), V2OperationDescriptorBytes)
	if !ok {
		return nil, errors.New("analytics v2 descriptor table size overflow")
	}
	descriptors := make([]V2OperationDescriptor, len(ops))
	payloadBytes := 0
	for i, op := range ops {
		if op.Descriptor.Flags != 0 || op.Descriptor.Status != V2StatusOK {
			return nil, errors.New("analytics v2 request operation descriptor is not canonical")
		}
		aligned, ok := align8Checked(payloadBytes)
		if !ok {
			return nil, errors.New("analytics v2 request payload size overflow")
		}
		payloadBytes = aligned
		next, ok := checkedAddInt(payloadBytes, len(op.Payload))
		if !ok {
			return nil, errors.New("analytics v2 request payload size overflow")
		}
		d := op.Descriptor
		d.PayloadOffset = uint64(payloadBytes)
		d.PayloadLength = uint64(len(op.Payload))
		descriptors[i] = d
		payloadBytes = next
	}
	frameBytes, ok := checkedAddInt(V2HeaderBytes, descriptorBytes)
	if !ok {
		return nil, errors.New("analytics v2 request frame size overflow")
	}
	frameBytes, ok = checkedAddInt(frameBytes, payloadBytes)
	if !ok || uint64(frameBytes) > V2MaxFrameBytes {
		return nil, errors.New("analytics v2 frame exceeds hard limit")
	}
	h := V2FrameHeader{
		ProtocolMajor:   V2ProtocolMajor,
		ProtocolMinor:   V2ProtocolMinor,
		MessageType:     V2MessageAnalyticsRequest,
		HeaderBytes:     V2HeaderBytes,
		RequestID:       requestID,
		OperationCount:  uint32(len(ops)),
		DescriptorBytes: uint32(descriptorBytes),
		PayloadBytes:    uint64(payloadBytes),
		TotalFrameBytes: uint64(frameBytes),
	}
	if err := ValidateV2FrameLayout(h, descriptors); err != nil {
		return nil, err
	}
	out := resizeV2Buffer(dst, frameBytes)
	if err := EncodeV2Header(out[:V2HeaderBytes], h); err != nil {
		return nil, err
	}
	payloadStart := V2HeaderBytes + descriptorBytes
	for i, d := range descriptors {
		descriptorStart := V2HeaderBytes + i*V2OperationDescriptorBytes
		if err := EncodeV2Descriptor(out[descriptorStart:descriptorStart+V2OperationDescriptorBytes], d); err != nil {
			return nil, err
		}
		copyStart := payloadStart + int(d.PayloadOffset)
		copy(out[copyStart:copyStart+len(ops[i].Payload)], ops[i].Payload)
	}
	return out, nil
}
