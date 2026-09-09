package analyticsengine

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const (
	v2HandshakeStatusOK uint32 = iota
	v2HandshakeStatusIncompatibleProtocol
	v2HandshakeStatusMissingRequiredOperation
	v2HandshakeStatusUnsupportedRequiredFeature
)

const defaultV2Watchdog = 10 * time.Second

type RustV2Client struct {
	mu       sync.RWMutex
	path     string
	args     []string
	env      []string
	watchdog time.Duration

	cmd       *exec.Cmd
	stdin     io.WriteCloser
	stdout    io.ReadCloser
	stderr    *boundedDiagnosticBuffer
	waitCh    chan error
	seq       uint64
	health    Health
	jobs      chan *v2BatchJob
	stopCh    chan struct{}
	ownerDone chan struct{}
	metrics   V2TransportMetrics
	encodeBuf []byte
}

type v2BatchJob struct {
	ctx        context.Context
	batch      AnalyticsBatch
	enqueuedAt time.Time
	resultCh   chan v2BatchOutcome
}
type v2BatchOutcome struct {
	result AnalyticsBatchResult
	err    error
}

func NewRustV2Client(path string, watchdog time.Duration) *RustV2Client {
	if watchdog <= 0 {
		watchdog = defaultV2Watchdog
	}
	return &RustV2Client{
		path:     path,
		watchdog: watchdog,
		health:   Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV2},
	}
}

func (c *RustV2Client) Start(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if strings.TrimSpace(c.path) == "" {
		return errors.New("rust analytics v2 worker path is required")
	}
	if c.cmd != nil || c.jobs != nil {
		return errors.New("rust analytics v2 worker already started")
	}
	if err := c.startProcessLocked(ctx); err != nil {
		return err
	}
	c.jobs = make(chan *v2BatchJob, 2)
	c.stopCh = make(chan struct{})
	c.ownerDone = make(chan struct{})
	go c.ownerLoop(c.jobs, c.stopCh, c.ownerDone)
	return nil
}

func (c *RustV2Client) startProcessLocked(ctx context.Context) error {
	if c.cmd != nil {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("rust analytics v2 worker startup canceled: %w", err)
	}

	cmd := exec.Command(c.path, c.args...)
	if len(c.env) > 0 {
		cmd.Env = append(os.Environ(), c.env...)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("rust analytics v2 worker stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("rust analytics v2 worker stdout: %w", err)
	}
	stderr := newBoundedDiagnosticBuffer(maxWorkerDiagnosticBytes)
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		c.health = Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV2, Message: sanitizeWorkerDiagnostic(err.Error())}
		return fmt.Errorf("start rust analytics v2 worker: %w", err)
	}
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()
	c.cmd = cmd
	c.stdin = stdin
	c.stdout = stdout
	c.stderr = stderr
	c.waitCh = waitCh
	c.health = Health{Status: EngineDegraded, Engine: "rust-native", Protocol: ProtocolV2, Message: "worker started; handshake pending"}

	if err := c.handshakeLocked(ctx); err != nil {
		c.stopProcessLocked()
		return err
	}
	return nil
}

func (c *RustV2Client) handshakeLocked(ctx context.Context) error {
	c.seq++
	requestID := c.seq
	registry := []V2OperationID{
		V2OpDistributionSimilarity,
		V2OpItemVolatility,
		V2OpClusterVolatility,
		V2OpSelectionProbability,
		V2OpProductRankingV01,
		V2OpCatalogRankingV01,
		V2OpStructuralIndexV01,
		V2OpStructuralDirectionV01,
		V2OpCompetitionAccelerationV02,
		V2OpDirectionalMomentumV02,
		V2OpPeerRelativeRankV02,
		V2OpAuthorConcentrationChangeV02,
		V2OpMovementDivergenceV02,
	}
	payload := make([]byte, 16+len(registry)*8)
	binary.LittleEndian.PutUint32(payload[0:4], 0)
	binary.LittleEndian.PutUint32(payload[4:8], uint32(len(registry)))
	binary.LittleEndian.PutUint64(payload[8:16], V2MaxFrameBytes)
	off := 16
	for _, op := range registry {
		binary.LittleEndian.PutUint16(payload[off:off+2], uint16(op))
		binary.LittleEndian.PutUint16(payload[off+2:off+4], 1)
		off += 8
	}
	frame := make([]byte, V2HeaderBytes+len(payload))
	h := V2FrameHeader{ProtocolMajor: V2ProtocolMajor, ProtocolMinor: V2ProtocolMinor, MessageType: V2MessageHandshakeRequest, HeaderBytes: V2HeaderBytes, RequestID: requestID, PayloadBytes: uint64(len(payload)), TotalFrameBytes: uint64(len(frame))}
	if err := EncodeV2Header(frame[:V2HeaderBytes], h); err != nil {
		return fmt.Errorf("encode rust analytics v2 handshake: %w", err)
	}
	copy(frame[V2HeaderBytes:], payload)
	if _, err := c.stdin.Write(frame); err != nil {
		c.health.Status = EngineDegraded
		c.health.Message = "worker handshake write failed"
		return fmt.Errorf("write rust analytics v2 handshake: %w", err)
	}

	type readResult struct {
		f   v2WireFrame
		err error
	}
	ch := make(chan readResult, 1)
	stdout := c.stdout
	go func() { f, e := readV2WireFrame(stdout); ch <- readResult{f: f, err: e} }()
	timeout := c.watchdog
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining < timeout {
			timeout = remaining
		}
	}
	if timeout <= 0 {
		c.health.Status = EngineTimedOut
		c.health.Message = "worker handshake timeout"
		return errors.New("rust analytics v2 handshake timeout")
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	var rr readResult
	select {
	case rr = <-ch:
	case <-ctx.Done():
		c.health.Status = EngineDegraded
		c.health.Message = "worker handshake canceled"
		return fmt.Errorf("rust analytics v2 handshake canceled: %w", ctx.Err())
	case <-timer.C:
		c.health.Status = EngineTimedOut
		c.health.Message = "worker handshake timeout"
		return errors.New("rust analytics v2 handshake timeout")
	}
	if rr.err != nil {
		if strings.Contains(rr.err.Error(), "protocol mismatch") {
			c.health.Status = EngineProtocolMismatch
			c.health.Message = "protocol mismatch"
			return fmt.Errorf("rust analytics v2 handshake protocol mismatch: %w", rr.err)
		}
		c.health.Status = EngineInvalidResult
		c.health.Message = "malformed handshake response"
		return fmt.Errorf("read rust analytics v2 handshake: %w", rr.err)
	}
	if rr.f.Header.MessageType != V2MessageHandshakeResponse {
		c.health.Status = EngineProtocolMismatch
		c.health.Message = "protocol mismatch"
		return errors.New("rust analytics v2 handshake protocol mismatch: unexpected message type")
	}
	if rr.f.Header.RequestID != requestID {
		c.health.Status = EngineInvalidResult
		c.health.Message = "handshake request id mismatch"
		return errors.New("rust analytics v2 handshake request id mismatch")
	}
	version, err := validateV2HandshakeResponse(rr.f.Payload)
	if err != nil {
		c.health.Status = EngineProtocolMismatch
		c.health.Message = sanitizeWorkerDiagnostic(err.Error())
		return err
	}
	c.health = Health{Status: EngineHealthy, Engine: "rust-native", Version: version, Protocol: ProtocolV2}
	return nil
}

func validateV2HandshakeResponse(payload []byte) (string, error) {
	if len(payload) < 24 {
		return "", errors.New("rust analytics v2 handshake response is truncated")
	}
	status := binary.LittleEndian.Uint32(payload[0:4])
	if status != v2HandshakeStatusOK {
		return "", errors.New("rust analytics v2 handshake protocol mismatch")
	}
	workerMax := binary.LittleEndian.Uint64(payload[8:16])
	if workerMax == 0 {
		return "", errors.New("rust analytics v2 handshake worker frame cap is invalid")
	}
	count := int(binary.LittleEndian.Uint32(payload[16:20]))
	versionLen := int(binary.LittleEndian.Uint16(payload[20:22]))
	if payload[22] != 0 || payload[23] != 0 {
		return "", errors.New("rust analytics v2 handshake reserved bytes must be zero")
	}
	registryBytes := count * 8
	versionStart := 24 + registryBytes
	rawEnd := versionStart + versionLen
	if count < 0 || versionStart < 24 || rawEnd < versionStart || rawEnd > len(payload) {
		return "", errors.New("rust analytics v2 handshake response length is invalid")
	}
	required := map[[2]uint16]bool{
		{1, 1}:  false,
		{2, 1}:  false,
		{3, 1}:  false,
		{4, 1}:  false,
		{5, 1}:  false,
		{6, 1}:  false,
		{7, 1}:  false,
		{8, 1}:  false,
		{9, 1}:  false,
		{10, 1}: false,
		{11, 1}: false,
		{12, 1}: false,
		{13, 1}: false,
	}
	for i := 0; i < count; i++ {
		off := 24 + i*8
		op := binary.LittleEndian.Uint16(payload[off : off+2])
		schema := binary.LittleEndian.Uint16(payload[off+2 : off+4])
		flags := binary.LittleEndian.Uint32(payload[off+4 : off+8])
		if flags != 0 {
			continue
		}
		key := [2]uint16{op, schema}
		if _, ok := required[key]; ok {
			required[key] = true
		}
	}
	for key, ok := range required {
		if !ok {
			return "", fmt.Errorf("rust analytics v2 handshake missing required capability operation=%d schema=%d", key[0], key[1])
		}
	}
	for _, b := range payload[rawEnd:] {
		if b != 0 {
			return "", errors.New("rust analytics v2 handshake padding must be zero")
		}
	}
	return string(payload[versionStart:rawEnd]), nil
}

type v2WireFrame struct {
	Header      V2FrameHeader
	Descriptors []V2OperationDescriptor
	Payload     []byte
}

func readV2WireFrame(r io.Reader) (v2WireFrame, error) {
	hdr := make([]byte, V2HeaderBytes)
	if _, err := io.ReadFull(r, hdr); err != nil {
		return v2WireFrame{}, err
	}
	h, err := DecodeV2Header(hdr)
	if err != nil {
		return v2WireFrame{}, err
	}
	remain64 := h.TotalFrameBytes - uint64(V2HeaderBytes)
	if remain64 > uint64(^uint(0)>>1) {
		return v2WireFrame{}, errors.New("analytics v2 frame exceeds platform size")
	}
	rest := make([]byte, int(remain64))
	if _, err := io.ReadFull(r, rest); err != nil {
		return v2WireFrame{}, err
	}
	ds := make([]V2OperationDescriptor, h.OperationCount)
	for i := range ds {
		start := i * V2OperationDescriptorBytes
		d, err := DecodeV2Descriptor(rest[start : start+V2OperationDescriptorBytes])
		if err != nil {
			return v2WireFrame{}, err
		}
		ds[i] = d
	}
	payload := append([]byte(nil), rest[int(h.DescriptorBytes):]...)
	return v2WireFrame{Header: h, Descriptors: ds, Payload: payload}, nil
}

func (c *RustV2Client) ExecuteBatch(ctx context.Context, batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := validateAnalyticsBatch(batch); err != nil {
		return AnalyticsBatchResult{}, err
	}
	c.mu.RLock()
	jobs, stop := c.jobs, c.stopCh
	running := jobs != nil && stop != nil
	c.mu.RUnlock()
	if !running {
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 worker is not running")
	}
	job := &v2BatchJob{ctx: ctx, batch: batch, enqueuedAt: time.Now(), resultCh: make(chan v2BatchOutcome, 1)}
	select {
	case jobs <- job:
	case <-ctx.Done():
		return AnalyticsBatchResult{}, ctx.Err()
	case <-stop:
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 client is closed")
	}
	select {
	case outcome := <-job.resultCh:
		return outcome.result, outcome.err
	case <-ctx.Done():
		return AnalyticsBatchResult{}, ctx.Err()
	case <-stop:
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 client is closed")
	}
}

func (c *RustV2Client) ownerLoop(jobs <-chan *v2BatchJob, stop <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	for {
		select {
		case <-stop:
			return
		case job := <-jobs:
			if job == nil {
				continue
			}
			if err := job.ctx.Err(); err != nil {
				job.resultCh <- v2BatchOutcome{err: err}
				continue
			}
			c.mu.Lock()
			c.metrics.InFlight = true
			c.metrics.LastQueueWaitMicros = uint64(time.Since(job.enqueuedAt).Microseconds())
			c.mu.Unlock()
			result, err := c.executeActiveBatch(job.batch)
			c.mu.Lock()
			c.metrics.InFlight = false
			c.mu.Unlock()
			job.resultCh <- v2BatchOutcome{result: result, err: err}
		}
	}
}

func (c *RustV2Client) ensureWorkerForBatch() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd != nil && c.stdin != nil && c.stdout != nil {
		return nil
	}
	if c.jobs == nil || c.stopCh == nil {
		return errors.New("rust analytics v2 client is closed")
	}
	timeout := c.watchdog
	if timeout <= 0 {
		timeout = defaultV2Watchdog
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := c.startProcessLocked(ctx); err != nil {
		return fmt.Errorf("restart rust analytics v2 worker: %w", err)
	}
	c.metrics.WorkerRestartCount++
	return nil
}

func (c *RustV2Client) executeActiveBatch(batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	if err := c.ensureWorkerForBatch(); err != nil {
		return AnalyticsBatchResult{}, err
	}
	c.mu.Lock()
	if c.cmd == nil || c.stdin == nil || c.stdout == nil {
		c.mu.Unlock()
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 worker is not running")
	}
	c.seq++
	requestID := c.seq
	stdin := c.stdin
	stdout := c.stdout
	watchdog := c.watchdog
	buf := c.encodeBuf
	c.mu.Unlock()
	encodeStart := time.Now()
	frame, err := encodeAnalyticsBatchV2(requestID, batch, buf)
	encodeMicros := uint64(time.Since(encodeStart).Microseconds())
	if err != nil {
		return AnalyticsBatchResult{}, err
	}
	frameBytes := uint64(len(frame))
	roundStart := time.Now()
	if err := writeAll(stdin, frame); err != nil {
		c.markHardFailure(EngineCrashed, "worker write failed")
		return AnalyticsBatchResult{}, fmt.Errorf("write rust analytics v2 request: %w", err)
	}
	type readResult struct {
		f   v2WireFrame
		err error
	}
	ch := make(chan readResult, 1)
	go func() { f, e := readV2WireFrame(stdout); ch <- readResult{f: f, err: e} }()
	if watchdog <= 0 {
		watchdog = defaultV2Watchdog
	}
	timer := time.NewTimer(watchdog)
	defer timer.Stop()
	var rr readResult
	select {
	case rr = <-ch:
	case <-timer.C:
		c.markHardFailure(EngineTimedOut, "worker watchdog timeout")
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 worker watchdog timeout")
	}
	roundMicros := uint64(time.Since(roundStart).Microseconds())
	if rr.err != nil {
		status := EngineInvalidResult
		message := "malformed worker response"
		if errors.Is(rr.err, io.EOF) {
			status = EngineCrashed
			message = "worker exited"
		}
		c.markHardFailure(status, message)
		return AnalyticsBatchResult{}, fmt.Errorf("read rust analytics v2 response: %w", rr.err)
	}
	if rr.f.Header.MessageType != V2MessageAnalyticsResponse {
		c.markHardFailure(EngineInvalidResult, "unexpected worker response")
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 response message type mismatch")
	}
	if rr.f.Header.RequestID != requestID {
		c.markHardFailure(EngineInvalidResult, "worker response request id mismatch")
		return AnalyticsBatchResult{}, errors.New("rust analytics v2 response request id mismatch")
	}
	decodeStart := time.Now()
	result, workerMicros, err := decodeAnalyticsBatchResult(rr.f)
	decodeMicros := uint64(time.Since(decodeStart).Microseconds())
	if err != nil {
		c.markHardFailure(EngineInvalidResult, "invalid worker response")
		return AnalyticsBatchResult{}, err
	}
	c.mu.Lock()
	c.encodeBuf = retainV2Buffer(frame)
	c.metrics.LastFrameBytes = frameBytes
	c.metrics.LastBatchOperationCount = len(batch.Operations)
	c.metrics.LastEncodeMicros = encodeMicros
	c.metrics.LastRoundTripMicros = roundMicros
	c.metrics.LastWorkerComputeMicros = workerMicros
	c.metrics.LastDecodeMicros = decodeMicros
	c.metrics.LastSuccessfulResponseAt = time.Now()
	c.health.Status = EngineHealthy
	c.health.Message = ""
	c.mu.Unlock()
	return result, nil
}

func decodeAnalyticsBatchResult(frame v2WireFrame) (AnalyticsBatchResult, uint64, error) {
	if len(frame.Descriptors) == 0 {
		return AnalyticsBatchResult{}, 0, errors.New("analytics v2 response contains no operations")
	}
	out := AnalyticsBatchResult{Operations: make([]BatchOperationResult, len(frame.Descriptors))}
	var workerMicros uint64
	for i, d := range frame.Descriptors {
		end := d.PayloadOffset + d.PayloadLength
		if end < d.PayloadOffset || end > uint64(len(frame.Payload)) {
			return AnalyticsBatchResult{}, 0, errors.New("analytics v2 response payload is outside frame")
		}
		payload := append([]byte(nil), frame.Payload[d.PayloadOffset:end]...)
		r := BatchOperationResult{
			SlotID:      d.SlotID,
			OperationID: d.OperationID,
			SchemaID:    d.SchemaID,
			Status:      d.Status,
			Payload:     payload,
		}
		if len(payload) >= 8 {
			r.DurationMicros = binary.LittleEndian.Uint64(payload[:8])
			if r.DurationMicros > workerMicros {
				workerMicros = r.DurationMicros
			}
		}
		if d.Status != V2StatusOK {
			r.Err = fmt.Errorf("analytics v2 operation slot=%d status=%d", d.SlotID, d.Status)
		}
		out.Operations[i] = r
	}
	return out, workerMicros, nil
}

func writeAll(w io.Writer, b []byte) error {
	for len(b) > 0 {
		n, err := w.Write(b)
		if err != nil {
			return err
		}
		if n <= 0 {
			return io.ErrShortWrite
		}
		b = b[n:]
	}
	return nil
}
func retainV2Buffer(buf []byte) []byte {
	if cap(buf) > 64<<20 {
		return nil
	}
	return buf[:0]
}
func (c *RustV2Client) markHardFailure(status EngineStatus, message string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.health.Status = status
	c.health.Message = sanitizeWorkerDiagnostic(message)
	c.stopProcessLocked()
}

func (c *RustV2Client) Metrics() V2TransportMetrics {
	c.mu.RLock()
	m := c.metrics
	jobs := c.jobs
	c.mu.RUnlock()
	if jobs != nil {
		m.QueueDepth = len(jobs)
	}
	return m
}
func (c *RustV2Client) Health() Health { c.mu.RLock(); defer c.mu.RUnlock(); return c.health }
func (c *RustV2Client) Close() error {
	c.mu.Lock()
	stop := c.stopCh
	done := c.ownerDone
	if stop != nil {
		select {
		case <-stop:
		default:
			close(stop)
		}
	}
	c.stopProcessLocked()
	c.jobs = nil
	c.stopCh = nil
	c.ownerDone = nil
	c.health = Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV2}
	c.mu.Unlock()
	if done != nil {
		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
		}
	}
	return nil
}
func (c *RustV2Client) stopProcessLocked() {
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	if c.waitCh != nil {
		select {
		case <-c.waitCh:
		case <-time.After(250 * time.Millisecond):
		}
	}
	c.cmd = nil
	c.stdin = nil
	c.stdout = nil
	c.waitCh = nil
}
