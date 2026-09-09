package analyticsengine

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	ProtocolV2                        = "msl-analytics/2"
	V2ProtocolMajor            uint16 = 2
	V2ProtocolMinor            uint16 = 0
	V2HeaderBytes                     = 64
	V2OperationDescriptorBytes        = 32
	V2MaxOperations            uint32 = 32
	V2MaxFrameBytes            uint64 = 128 << 20
)

type V2MessageType uint16

const (
	V2MessageHandshakeRequest  V2MessageType = 1
	V2MessageHandshakeResponse V2MessageType = 2
	V2MessageAnalyticsRequest  V2MessageType = 3
	V2MessageAnalyticsResponse V2MessageType = 4
)

type V2OperationID uint16
type V2SchemaID uint16
type V2OperationStatus uint32

const (
	V2OpDistributionSimilarity       V2OperationID = 1
	V2OpItemVolatility               V2OperationID = 2
	V2OpClusterVolatility            V2OperationID = 3
	V2OpSelectionProbability         V2OperationID = 4
	V2OpProductRankingV01            V2OperationID = 5
	V2OpCatalogRankingV01            V2OperationID = 6
	V2OpStructuralIndexV01           V2OperationID = 7
	V2OpStructuralDirectionV01       V2OperationID = 8
	V2OpCompetitionAccelerationV02   V2OperationID = 9
	V2OpDirectionalMomentumV02       V2OperationID = 10
	V2OpPeerRelativeRankV02          V2OperationID = 11
	V2OpAuthorConcentrationChangeV02 V2OperationID = 12
	V2OpMovementDivergenceV02        V2OperationID = 13
)

const (
	V2StatusOK V2OperationStatus = iota
	V2StatusInvalidInput
	V2StatusUnsupportedOperation
	V2StatusUnsupportedSchema
	V2StatusMalformedPayload
	V2StatusInternalError
)

type V2FrameHeader struct {
	ProtocolMajor   uint16
	ProtocolMinor   uint16
	MessageType     V2MessageType
	Flags           uint16
	HeaderBytes     uint32
	RequestID       uint64
	OperationCount  uint32
	DescriptorBytes uint32
	PayloadBytes    uint64
	TotalFrameBytes uint64
}

type V2OperationDescriptor struct {
	SlotID        uint32
	OperationID   V2OperationID
	SchemaID      V2SchemaID
	Flags         uint32
	Status        V2OperationStatus
	PayloadOffset uint64
	PayloadLength uint64
}

func EncodeV2Header(dst []byte, h V2FrameHeader) error {
	if len(dst) < V2HeaderBytes {
		return errors.New("analytics v2 header buffer is too small")
	}
	if h.HeaderBytes == 0 {
		h.HeaderBytes = V2HeaderBytes
	}
	if err := validateV2Header(h); err != nil {
		return err
	}
	clear(dst[:V2HeaderBytes])
	copy(dst[0:4], "MSL2")
	binary.LittleEndian.PutUint16(dst[4:6], h.ProtocolMajor)
	binary.LittleEndian.PutUint16(dst[6:8], h.ProtocolMinor)
	binary.LittleEndian.PutUint16(dst[8:10], uint16(h.MessageType))
	binary.LittleEndian.PutUint16(dst[10:12], h.Flags)
	binary.LittleEndian.PutUint32(dst[12:16], h.HeaderBytes)
	binary.LittleEndian.PutUint64(dst[16:24], h.RequestID)
	binary.LittleEndian.PutUint32(dst[24:28], h.OperationCount)
	binary.LittleEndian.PutUint32(dst[28:32], h.DescriptorBytes)
	binary.LittleEndian.PutUint64(dst[32:40], h.PayloadBytes)
	binary.LittleEndian.PutUint64(dst[40:48], h.TotalFrameBytes)
	return nil
}

func DecodeV2Header(src []byte) (V2FrameHeader, error) {
	if len(src) < V2HeaderBytes {
		return V2FrameHeader{}, errors.New("analytics v2 header is truncated")
	}
	if string(src[0:4]) != "MSL2" {
		return V2FrameHeader{}, errors.New("analytics v2 magic mismatch")
	}
	for _, b := range src[48:64] {
		if b != 0 {
			return V2FrameHeader{}, errors.New("analytics v2 reserved header bytes must be zero")
		}
	}
	h := V2FrameHeader{
		ProtocolMajor:   binary.LittleEndian.Uint16(src[4:6]),
		ProtocolMinor:   binary.LittleEndian.Uint16(src[6:8]),
		MessageType:     V2MessageType(binary.LittleEndian.Uint16(src[8:10])),
		Flags:           binary.LittleEndian.Uint16(src[10:12]),
		HeaderBytes:     binary.LittleEndian.Uint32(src[12:16]),
		RequestID:       binary.LittleEndian.Uint64(src[16:24]),
		OperationCount:  binary.LittleEndian.Uint32(src[24:28]),
		DescriptorBytes: binary.LittleEndian.Uint32(src[28:32]),
		PayloadBytes:    binary.LittleEndian.Uint64(src[32:40]),
		TotalFrameBytes: binary.LittleEndian.Uint64(src[40:48]),
	}
	if err := validateV2Header(h); err != nil {
		return V2FrameHeader{}, err
	}
	return h, nil
}

func EncodeV2Descriptor(dst []byte, d V2OperationDescriptor) error {
	if len(dst) < V2OperationDescriptorBytes {
		return errors.New("analytics v2 descriptor buffer is too small")
	}
	if d.Flags != 0 {
		return errors.New("analytics v2 descriptor flags are unsupported")
	}
	clear(dst[:V2OperationDescriptorBytes])
	binary.LittleEndian.PutUint32(dst[0:4], d.SlotID)
	binary.LittleEndian.PutUint16(dst[4:6], uint16(d.OperationID))
	binary.LittleEndian.PutUint16(dst[6:8], uint16(d.SchemaID))
	binary.LittleEndian.PutUint32(dst[8:12], d.Flags)
	binary.LittleEndian.PutUint32(dst[12:16], uint32(d.Status))
	binary.LittleEndian.PutUint64(dst[16:24], d.PayloadOffset)
	binary.LittleEndian.PutUint64(dst[24:32], d.PayloadLength)
	return nil
}

func DecodeV2Descriptor(src []byte) (V2OperationDescriptor, error) {
	if len(src) < V2OperationDescriptorBytes {
		return V2OperationDescriptor{}, errors.New("analytics v2 descriptor is truncated")
	}
	d := V2OperationDescriptor{
		SlotID:        binary.LittleEndian.Uint32(src[0:4]),
		OperationID:   V2OperationID(binary.LittleEndian.Uint16(src[4:6])),
		SchemaID:      V2SchemaID(binary.LittleEndian.Uint16(src[6:8])),
		Flags:         binary.LittleEndian.Uint32(src[8:12]),
		Status:        V2OperationStatus(binary.LittleEndian.Uint32(src[12:16])),
		PayloadOffset: binary.LittleEndian.Uint64(src[16:24]),
		PayloadLength: binary.LittleEndian.Uint64(src[24:32]),
	}
	if d.Flags != 0 {
		return V2OperationDescriptor{}, errors.New("analytics v2 descriptor flags are unsupported")
	}
	if d.Status > V2StatusInternalError {
		return V2OperationDescriptor{}, errors.New("analytics v2 operation status is unknown")
	}
	return d, nil
}

func ValidateV2FrameLayout(h V2FrameHeader, descriptors []V2OperationDescriptor) error {
	if h.HeaderBytes == 0 {
		h.HeaderBytes = V2HeaderBytes
	}
	if err := validateV2Header(h); err != nil {
		return err
	}
	if uint32(len(descriptors)) != h.OperationCount {
		return fmt.Errorf("analytics v2 descriptor count=%d want=%d", len(descriptors), h.OperationCount)
	}
	seenSlots := make(map[uint32]struct{}, len(descriptors))
	for i, d := range descriptors {
		if d.SlotID == 0 {
			return errors.New("analytics v2 slot id must be non-zero")
		}
		if _, exists := seenSlots[d.SlotID]; exists {
			return errors.New("analytics v2 slot id must be unique")
		}
		seenSlots[d.SlotID] = struct{}{}
		if d.Flags != 0 {
			return errors.New("analytics v2 descriptor flags are unsupported")
		}
		if h.MessageType == V2MessageAnalyticsRequest && d.Status != V2StatusOK {
			return errors.New("analytics v2 request descriptor status must be zero")
		}
		if d.Status > V2StatusInternalError {
			return errors.New("analytics v2 operation status is unknown")
		}
		end, ok := checkedAddU64(d.PayloadOffset, d.PayloadLength)
		if !ok || end > h.PayloadBytes {
			return errors.New("analytics v2 operation payload is outside frame")
		}
		if d.PayloadLength == 0 {
			continue
		}
		for j := 0; j < i; j++ {
			other := descriptors[j]
			if other.PayloadLength == 0 {
				continue
			}
			otherEnd, ok := checkedAddU64(other.PayloadOffset, other.PayloadLength)
			if !ok {
				return errors.New("analytics v2 operation payload overflow")
			}
			if d.PayloadOffset < otherEnd && other.PayloadOffset < end {
				return errors.New("analytics v2 operation payloads overlap")
			}
		}
	}
	return nil
}

func validateV2Header(h V2FrameHeader) error {
	if h.ProtocolMajor != V2ProtocolMajor || h.ProtocolMinor != V2ProtocolMinor {
		return errors.New("analytics v2 protocol mismatch")
	}
	if h.HeaderBytes != V2HeaderBytes {
		return errors.New("analytics v2 header size mismatch")
	}
	if h.Flags != 0 {
		return errors.New("analytics v2 header flags are unsupported")
	}
	if h.RequestID == 0 {
		return errors.New("analytics v2 request id must be non-zero")
	}
	switch h.MessageType {
	case V2MessageHandshakeRequest, V2MessageHandshakeResponse:
		if h.OperationCount != 0 || h.DescriptorBytes != 0 {
			return errors.New("analytics v2 handshake frame cannot have operation descriptors")
		}
	case V2MessageAnalyticsRequest, V2MessageAnalyticsResponse:
		if h.OperationCount == 0 || h.OperationCount > V2MaxOperations {
			return errors.New("analytics v2 operation count is invalid")
		}
		wantDescriptorBytes := uint64(h.OperationCount) * uint64(V2OperationDescriptorBytes)
		if wantDescriptorBytes > uint64(^uint32(0)) || h.DescriptorBytes != uint32(wantDescriptorBytes) {
			return errors.New("analytics v2 descriptor table size mismatch")
		}
	default:
		return errors.New("analytics v2 message type is invalid")
	}
	base := uint64(V2HeaderBytes) + uint64(h.DescriptorBytes)
	total, ok := checkedAddU64(base, h.PayloadBytes)
	if !ok || h.TotalFrameBytes != total {
		return errors.New("analytics v2 total frame size mismatch")
	}
	if h.TotalFrameBytes > V2MaxFrameBytes {
		return errors.New("analytics v2 frame exceeds hard limit")
	}
	return nil
}

func checkedAddU64(a, b uint64) (uint64, bool) {
	if b > ^uint64(0)-a {
		return 0, false
	}
	return a + b, true
}
