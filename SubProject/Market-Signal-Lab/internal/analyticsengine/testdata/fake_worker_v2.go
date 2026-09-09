package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"time"

	ae "marketsignallab/internal/analyticsengine"
)

func main() {
	mode := "normal"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}
	trace("start:" + strconv.Itoa(os.Getpid()))
	first, err := readFrame(os.Stdin)
	if err != nil {
		return
	}
	if first.h.MessageType != ae.V2MessageHandshakeRequest {
		return
	}
	trace("handshake:" + strconv.FormatUint(first.h.RequestID, 10))
	if err := writeHandshake(os.Stdout, first.h.RequestID, mode); err != nil {
		return
	}
	if mode == "protocol-mismatch" || mode == "missing-capability" {
		return
	}
	for {
		frame, err := readFrame(os.Stdin)
		if err != nil {
			return
		}
		if frame.h.MessageType != ae.V2MessageAnalyticsRequest {
			return
		}
		trace("analytics:" + strconv.FormatUint(frame.h.RequestID, 10))
		effectiveMode := mode
		if isBatchFailureMode(mode) && !consumeFailOnceToken() {
			effectiveMode = "normal"
		}
		switch effectiveMode {
		case "hang":
			for {
				time.Sleep(time.Hour)
			}
		case "exit":
			os.Exit(7)
		case "slow-batch":
			time.Sleep(250 * time.Millisecond)
		case "malformed-response":
			_, _ = os.Stdout.Write([]byte("bad"))
			return
		}
		rid := frame.h.RequestID
		if effectiveMode == "wrong-request-id" {
			rid++
		}
		if err := writeAnalyticsResponse(os.Stdout, rid, frame.descriptors); err != nil {
			return
		}
	}
}

type frame struct {
	h           ae.V2FrameHeader
	descriptors []ae.V2OperationDescriptor
	payload     []byte
}

func readFrame(r io.Reader) (frame, error) {
	hdr := make([]byte, ae.V2HeaderBytes)
	if _, err := io.ReadFull(r, hdr); err != nil {
		return frame{}, err
	}
	h, err := ae.DecodeV2Header(hdr)
	if err != nil {
		return frame{}, err
	}
	remain := int(h.TotalFrameBytes) - ae.V2HeaderBytes
	rest := make([]byte, remain)
	if _, err := io.ReadFull(r, rest); err != nil {
		return frame{}, err
	}
	ds := make([]ae.V2OperationDescriptor, h.OperationCount)
	for i := range ds {
		start := i * ae.V2OperationDescriptorBytes
		d, err := ae.DecodeV2Descriptor(rest[start : start+ae.V2OperationDescriptorBytes])
		if err != nil {
			return frame{}, err
		}
		ds[i] = d
	}
	return frame{h: h, descriptors: ds, payload: rest[int(h.DescriptorBytes):]}, nil
}

func writeHandshake(w io.Writer, requestID uint64, mode string) error {
	status := uint32(0)
	registry := [][2]uint16{
		{1, 1}, {2, 1}, {3, 1}, {4, 1},
		{5, 1}, {6, 1}, {7, 1}, {8, 1},
		{9, 1}, {10, 1}, {11, 1}, {12, 1}, {13, 1},
	}
	if mode == "protocol-mismatch" {
		status = 1
	}
	if mode == "missing-capability" {
		registry = registry[:7]
	}
	version := []byte("fake-v2")
	raw := 24 + len(registry)*8 + len(version)
	padded := (raw + 7) &^ 7
	p := make([]byte, padded)
	binary.LittleEndian.PutUint32(p[0:4], status)
	binary.LittleEndian.PutUint32(p[4:8], 0)
	binary.LittleEndian.PutUint64(p[8:16], ae.V2MaxFrameBytes)
	binary.LittleEndian.PutUint32(p[16:20], uint32(len(registry)))
	binary.LittleEndian.PutUint16(p[20:22], uint16(len(version)))
	off := 24
	for _, e := range registry {
		binary.LittleEndian.PutUint16(p[off:off+2], e[0])
		binary.LittleEndian.PutUint16(p[off+2:off+4], e[1])
		off += 8
	}
	copy(p[off:], version)
	return writeFrame(w, ae.V2MessageHandshakeResponse, requestID, nil, p)
}
func writeAnalyticsResponse(w io.Writer, requestID uint64, req []ae.V2OperationDescriptor) error {
	ds := make([]ae.V2OperationDescriptor, len(req))
	payload := make([]byte, 0, len(req)*64)
	for i, d := range req {
		result := resultPayload(d.OperationID)
		offset := len(payload)
		payload = append(payload, result...)
		ds[i] = ae.V2OperationDescriptor{
			SlotID: d.SlotID, OperationID: d.OperationID, SchemaID: d.SchemaID,
			Status: ae.V2StatusOK, PayloadOffset: uint64(offset), PayloadLength: uint64(len(result)),
		}
	}
	return writeFrame(w, ae.V2MessageAnalyticsResponse, requestID, ds, payload)
}

func resultPayload(op ae.V2OperationID) []byte {
	switch op {
	case ae.V2OpDistributionSimilarity:
		p := make([]byte, 16)
		binary.LittleEndian.PutUint64(p[0:8], 123)
		binary.LittleEndian.PutUint64(p[8:16], math.Float64bits(42.5))
		return p
	case ae.V2OpItemVolatility, ae.V2OpClusterVolatility:
		p := make([]byte, 64)
		binary.LittleEndian.PutUint64(p[0:8], 123)
		p[8] = 1
		binary.LittleEndian.PutUint64(p[16:24], math.Float64bits(0.75))
		binary.LittleEndian.PutUint64(p[24:32], math.Float64bits(2))
		binary.LittleEndian.PutUint64(p[32:40], math.Float64bits(0.1))
		binary.LittleEndian.PutUint64(p[40:48], math.Float64bits(1.5))
		binary.LittleEndian.PutUint64(p[48:56], math.Float64bits(0.8))
		binary.LittleEndian.PutUint64(p[56:64], math.Float64bits(0.9))
		return p
	case ae.V2OpSelectionProbability:
		p := make([]byte, 48)
		binary.LittleEndian.PutUint64(p[0:8], 123)
		binary.LittleEndian.PutUint64(p[8:16], math.Float64bits(0.6))
		binary.LittleEndian.PutUint64(p[16:24], math.Float64bits(3))
		binary.LittleEndian.PutUint64(p[24:32], math.Float64bits(5))
		binary.LittleEndian.PutUint64(p[32:40], 2)
		binary.LittleEndian.PutUint64(p[40:48], 4)
		return p
	default:
		p := make([]byte, 8)
		binary.LittleEndian.PutUint64(p[0:8], 123)
		return p
	}
}

func writeFrame(w io.Writer, mt ae.V2MessageType, requestID uint64, ds []ae.V2OperationDescriptor, payload []byte) error {
	total := ae.V2HeaderBytes + len(ds)*ae.V2OperationDescriptorBytes + len(payload)
	b := make([]byte, total)
	h := ae.V2FrameHeader{ProtocolMajor: ae.V2ProtocolMajor, ProtocolMinor: ae.V2ProtocolMinor, MessageType: mt, HeaderBytes: ae.V2HeaderBytes, RequestID: requestID, OperationCount: uint32(len(ds)), DescriptorBytes: uint32(len(ds) * ae.V2OperationDescriptorBytes), PayloadBytes: uint64(len(payload)), TotalFrameBytes: uint64(total)}
	if err := ae.EncodeV2Header(b[:64], h); err != nil {
		return err
	}
	for i, d := range ds {
		if err := ae.EncodeV2Descriptor(b[64+i*32:64+(i+1)*32], d); err != nil {
			return err
		}
	}
	copy(b[64+len(ds)*32:], payload)
	_, err := w.Write(b)
	return err
}
func isBatchFailureMode(mode string) bool {
	switch mode {
	case "hang", "exit", "malformed-response", "wrong-request-id":
		return true
	default:
		return false
	}
}

func consumeFailOnceToken() bool {
	path := os.Getenv("MSL_FAKE_WORKER_FAIL_ONCE")
	if path == "" {
		return true
	}
	if _, err := os.Stat(path); err == nil {
		return false
	}
	if err := os.WriteFile(path, []byte("failed"), 0600); err != nil {
		return true
	}
	return true
}

func trace(s string) {
	path := os.Getenv("MSL_FAKE_WORKER_TRACE")
	if path == "" {
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = fmt.Fprintln(f, s)
}
