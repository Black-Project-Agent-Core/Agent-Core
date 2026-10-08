package analyticsengine

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

const maxWorkerLineBytes = 64 << 20
const maxWorkerDiagnosticBytes = 8 << 10

type RustClient struct {
	mu      sync.Mutex
	path    string
	timeout time.Duration
	env     []string

	cmd     *exec.Cmd
	stdin   io.WriteCloser
	scanner *bufio.Scanner
	stderr  *boundedDiagnosticBuffer
	waitCh  chan error
	seq     uint64
	health  Health
}

func NewRustClient(path string, timeout time.Duration) *RustClient {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &RustClient{path: path, timeout: timeout, health: Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV1}}
}

func (c *RustClient) Start(ctx context.Context) error {
	if err := c.StartWithoutHandshake(ctx); err != nil {
		return err
	}
	var capabilities struct {
		Protocol     string       `json:"protocol"`
		Capabilities []Capability `json:"capabilities"`
	}
	if _, err := c.Call(ctx, OpCapabilities, map[string]any{}, &capabilities); err != nil {
		_ = c.Close()
		return fmt.Errorf("rust analytics handshake failed: %w", err)
	}
	if capabilities.Protocol != ProtocolV1 {
		_ = c.Close()
		return fmt.Errorf("rust analytics handshake protocol mismatch: %q", capabilities.Protocol)
	}
	if !sameCapabilities(capabilities.Capabilities, PilotCapabilities()) {
		_ = c.Close()
		return fmt.Errorf("rust analytics capabilities mismatch: %v", capabilities.Capabilities)
	}
	c.mu.Lock()
	c.health = Health{Status: EngineHealthy, Engine: "rust-native", Version: "0.1.0", Protocol: ProtocolV1}
	c.mu.Unlock()
	return nil
}

// StartWithoutHandshake exists for focused protocol-failure tests and diagnostics.
// Normal application construction must use Start so protocol/capabilities are verified first.
func (c *RustClient) StartWithoutHandshake(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if strings.TrimSpace(c.path) == "" {
		return errors.New("rust analytics worker path is required")
	}
	if c.cmd != nil {
		return errors.New("rust analytics worker already started")
	}
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("rust analytics worker startup canceled: %w", err)
	}
	// The startup context bounds readiness/handshake only. The worker is long-lived
	// and must outlive that context; Close/call timeout/crash handling owns process lifetime.
	cmd := exec.Command(c.path)
	if len(c.env) > 0 {
		cmd.Env = append([]string(nil), c.env...)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("rust worker stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("rust worker stdout: %w", err)
	}
	stderr := newBoundedDiagnosticBuffer(maxWorkerDiagnosticBytes)
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		c.health = Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV1, Message: sanitizeWorkerDiagnostic(err.Error())}
		return fmt.Errorf("start rust analytics worker: %w", err)
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), maxWorkerLineBytes)
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()
	c.cmd = cmd
	c.stdin = stdin
	c.scanner = scanner
	c.stderr = stderr
	c.waitCh = waitCh
	c.health = Health{Status: EngineDegraded, Engine: "rust-native", Protocol: ProtocolV1, Message: "worker started; handshake pending"}
	return nil
}

func sameCapabilities(a, b []Capability) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[Capability]int, len(a))
	for _, capability := range a {
		seen[capability]++
	}
	for _, capability := range b {
		seen[capability]--
	}
	for _, count := range seen {
		if count != 0 {
			return false
		}
	}
	return true
}

func (c *RustClient) Call(ctx context.Context, op string, input any, out any) (uint64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd == nil || c.stdin == nil || c.scanner == nil {
		return 0, errors.New("rust analytics worker is not running")
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return 0, fmt.Errorf("marshal rust analytics input: %w", err)
	}
	c.seq++
	requestID := fmt.Sprintf("req-%d", c.seq)
	req := ProtocolRequest{Protocol: ProtocolV1, ID: requestID, Op: op, Input: inputJSON}
	if err := ValidateProtocolRequest(req); err != nil {
		return 0, err
	}
	wire, err := json.Marshal(req)
	if err != nil {
		return 0, fmt.Errorf("marshal rust analytics request: %w", err)
	}
	if len(wire)+1 > maxWorkerLineBytes {
		return 0, errors.New("rust analytics request exceeds maximum line size")
	}
	if _, err := c.stdin.Write(append(wire, '\n')); err != nil {
		c.markFailureLocked("worker write failed")
		return 0, fmt.Errorf("write rust analytics request: %w", err)
	}

	timeout := c.timeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining < timeout {
			timeout = remaining
		}
	}
	if timeout <= 0 {
		c.killLocked("worker call timeout")
		return 0, errors.New("rust analytics worker timeout")
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	type scanResult struct {
		line []byte
		err  error
	}
	resultCh := make(chan scanResult, 1)
	scanner := c.scanner
	go func() {
		if scanner.Scan() {
			resultCh <- scanResult{line: append([]byte(nil), scanner.Bytes()...)}
			return
		}
		if err := scanner.Err(); err != nil {
			resultCh <- scanResult{err: err}
			return
		}
		resultCh <- scanResult{err: io.EOF}
	}()

	var scanned scanResult
	select {
	case scanned = <-resultCh:
	case <-ctx.Done():
		c.killLocked("worker call canceled")
		return 0, ctx.Err()
	case <-timer.C:
		c.killLocked("worker call timeout")
		return 0, errors.New("rust analytics worker timeout")
	}
	if scanned.err != nil {
		c.awaitExitLocked(100 * time.Millisecond)
		diag := c.lastDiagnosticLocked()
		c.markFailureLocked("worker exited")
		if diag != "" {
			return 0, fmt.Errorf("rust analytics worker exited: %s", diag)
		}
		return 0, fmt.Errorf("rust analytics worker read failed: %w", scanned.err)
	}
	if len(scanned.line) >= maxWorkerLineBytes {
		c.killLocked("worker response exceeds maximum line size")
		return 0, errors.New("rust analytics worker response exceeds maximum line size")
	}
	var resp ProtocolResponse
	if err := json.Unmarshal(scanned.line, &resp); err != nil {
		c.markFailureLocked("malformed worker response")
		return 0, fmt.Errorf("decode rust analytics response: %w", err)
	}
	if err := ValidateProtocolResponse(requestID, resp); err != nil {
		c.markFailureLocked(err.Code)
		return resp.DurationMicros, err
	}
	if !resp.OK {
		c.markFailureLocked(resp.Error.Code)
		return resp.DurationMicros, resp.Error
	}
	if out != nil && len(resp.Result) > 0 {
		if err := json.Unmarshal(resp.Result, out); err != nil {
			c.markFailureLocked("invalid worker result")
			return resp.DurationMicros, fmt.Errorf("decode rust analytics result: %w", err)
		}
	}
	c.health.Status = EngineHealthy
	c.health.Engine = resp.Engine
	c.health.Version = resp.EngineVersion
	c.health.Protocol = resp.Protocol
	c.health.Message = ""
	return resp.DurationMicros, nil
}

func (c *RustClient) Health() Health {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.health
}

func (c *RustClient) LastDiagnostic() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastDiagnosticLocked()
}

func (c *RustClient) lastDiagnosticLocked() string {
	if c.stderr == nil {
		return ""
	}
	return sanitizeWorkerDiagnostic(c.stderr.String())
}

func (c *RustClient) markFailureLocked(message string) {
	c.health.Status = EngineDegraded
	c.health.Message = sanitizeWorkerDiagnostic(message)
}

func (c *RustClient) killLocked(message string) {
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	c.health.Status = EngineDegraded
	c.health.Message = sanitizeWorkerDiagnostic(message)
}

func (c *RustClient) awaitExitLocked(max time.Duration) {
	if c.waitCh == nil {
		return
	}
	select {
	case <-c.waitCh:
	case <-time.After(max):
	}
}

func (c *RustClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd == nil {
		c.health = Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV1}
		return nil
	}
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	c.awaitExitLocked(250 * time.Millisecond)
	c.cmd = nil
	c.stdin = nil
	c.scanner = nil
	c.waitCh = nil
	c.health = Health{Status: EngineUnavailable, Engine: "rust-native", Protocol: ProtocolV1}
	return nil
}

type boundedDiagnosticBuffer struct {
	mu  sync.Mutex
	max int
	buf []byte
}

func newBoundedDiagnosticBuffer(max int) *boundedDiagnosticBuffer {
	return &boundedDiagnosticBuffer{max: max}
}
func (b *boundedDiagnosticBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = append(b.buf, p...)
	if len(b.buf) > b.max {
		b.buf = append([]byte(nil), b.buf[len(b.buf)-b.max:]...)
	}
	return len(p), nil
}
func (b *boundedDiagnosticBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return string(append([]byte(nil), b.buf...))
}

var authorizationDiagnosticPattern = regexp.MustCompile(`(?i)(authorization\s*:\s*)(?:bearer\s+)?[^\s]+`)
var bearerDiagnosticPattern = regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+`)
var tokenDiagnosticPattern = regexp.MustCompile(`(?i)((?:personal[_-]?token|token)\s*[=:]\s*)[^\s]+`)

func sanitizeWorkerDiagnostic(message string) string {
	message = authorizationDiagnosticPattern.ReplaceAllString(message, `${1}[redacted]`)
	message = bearerDiagnosticPattern.ReplaceAllString(message, `${1}[redacted]`)
	message = tokenDiagnosticPattern.ReplaceAllString(message, `${1}[redacted]`)
	message = strings.TrimSpace(message)
	if len(message) > maxWorkerDiagnosticBytes {
		message = message[len(message)-maxWorkerDiagnosticBytes:]
	}
	return string(bytes.ToValidUTF8([]byte(message), []byte("?")))
}
