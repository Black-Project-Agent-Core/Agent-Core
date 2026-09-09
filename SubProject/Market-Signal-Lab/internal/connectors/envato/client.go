package envato

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.envato.com"

type HTTPStatusError struct {
	StatusCode  int
	Path        string
	Description string
}

func (e *HTTPStatusError) Error() string {
	message := fmt.Sprintf("Envato API HTTP %d", e.StatusCode)
	if strings.TrimSpace(e.Path) != "" {
		message += " for " + e.Path
	}
	if strings.TrimSpace(e.Description) != "" {
		message += ": " + e.Description
	}
	return message
}

type TokenPermissionError struct {
	RequiredPermission string
	Cause              error
}

func (e *TokenPermissionError) Error() string {
	permission := strings.TrimSpace(e.RequiredPermission)
	if permission == "" {
		permission = "View and search Envato sites"
	}
	return fmt.Sprintf("Envato token is valid but cannot access catalog search. Create a new personal token with %q and %q enabled", permission, "View your Envato Account username")
}

func (e *TokenPermissionError) Unwrap() error { return e.Cause }

type SearchRequest struct {
	Term     string `json:"term"`
	Site     string `json:"site"`
	Category string `json:"category,omitempty"`
	Page     int    `json:"page,omitempty"`
	PageSize int    `json:"pageSize,omitempty"`
	SortBy   string `json:"sortBy,omitempty"`
}

type SearchAggregate struct {
	Term           string  `json:"term"`
	Site           string  `json:"site"`
	Category       string  `json:"category,omitempty"`
	TotalHits      int     `json:"totalHits"`
	TotalHitsExact bool    `json:"totalHitsExact"`
	Returned       int     `json:"returned"`
	TookMs         float64 `json:"tookMs,omitempty"`
	ObservedAt     string  `json:"observedAt"`
}

type TotalItemsAggregate struct {
	TotalItems int64  `json:"totalItems"`
	ObservedAt string `json:"observedAt"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	sleep      func(time.Duration)
}

type Option func(*Client)

func WithBaseURL(v string) Option { return func(c *Client) { c.baseURL = strings.TrimRight(v, "/") } }
func WithHTTPClient(v *http.Client) Option {
	return func(c *Client) {
		if v != nil {
			c.httpClient = v
		}
	}
}
func WithSleep(v func(time.Duration)) Option {
	return func(c *Client) {
		if v != nil {
			c.sleep = v
		}
	}
}

func NewClient(opts ...Option) *Client {
	c := &Client{baseURL: defaultBaseURL, httpClient: &http.Client{Timeout: 15 * time.Second}, sleep: time.Sleep}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func responseErrorDescription(body []byte, token string) string {
	var payload map[string]any
	parts := []string{}
	if json.Unmarshal(body, &payload) == nil {
		for _, key := range []string{"error", "reason", "description", "message"} {
			if value, ok := payload[key].(string); ok {
				value = strings.TrimSpace(value)
				if value != "" && !containsString(parts, value) {
					parts = append(parts, value)
				}
			}
		}
	}
	description := strings.Join(parts, ": ")
	description = strings.Join(strings.Fields(description), " ")
	if token != "" {
		description = strings.ReplaceAll(description, token, "[REDACTED]")
	}
	if len(description) > 240 {
		description = description[:240] + "…"
	}
	return description
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func (c *Client) doGET(ctx context.Context, token, path string, q url.Values, maxHTTPRequests int) ([]byte, int, error) {
	if strings.TrimSpace(token) == "" {
		return nil, 0, errors.New("Envato personal token is required")
	}
	if maxHTTPRequests <= 0 {
		return nil, 0, errors.New("HTTP request allowance must be at least 1")
	}
	attemptLimit := maxHTTPRequests
	if attemptLimit > 2 {
		attemptLimit = 2
	}
	endpoint := c.baseURL + path
	if len(q) > 0 {
		endpoint += "?" + q.Encode()
	}
	attempts := 0
	for attempts < attemptLimit {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, attempts, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "Market Signal Lab/0.3 private-research")
		attempts++
		requestStarted := time.Now()
		resp, err := c.httpClient.Do(req)
		latency := time.Since(requestStarted)
		if err != nil {
			emitRequestTelemetry(ctx, RequestTelemetry{Latency: latency, RetryCount: maxZero(attempts - 1)})
			return nil, attempts, err
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if readErr != nil {
			return nil, attempts, readErr
		}
		if resp.StatusCode == http.StatusTooManyRequests && attempts < attemptLimit {
			seconds, _ := strconv.Atoi(strings.TrimSpace(resp.Header.Get("Retry-After")))
			if seconds < 0 {
				seconds = 0
			}
			if seconds > 30 {
				seconds = 30
			}
			delay := time.Duration(seconds) * time.Second
			emitRequestTelemetry(ctx, RequestTelemetry{HTTPStatus: resp.StatusCode, Latency: latency, RetryCount: 1, RetryDelay: delay})
			c.sleep(delay)
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			emitRequestTelemetry(ctx, RequestTelemetry{HTTPStatus: resp.StatusCode, Latency: latency, RetryCount: maxZero(attempts - 1)})
			return nil, attempts, &HTTPStatusError{
				StatusCode:  resp.StatusCode,
				Path:        path,
				Description: responseErrorDescription(body, token),
			}
		}
		emitRequestTelemetry(ctx, RequestTelemetry{HTTPStatus: resp.StatusCode, Latency: latency, RetryCount: maxZero(attempts - 1)})
		return body, attempts, nil
	}
	return nil, attempts, errors.New("Envato API request exhausted retry")
}

func rawInt(v json.RawMessage) int {
	if len(v) == 0 {
		return 0
	}
	var n int
	if json.Unmarshal(v, &n) == nil {
		return n
	}
	var f float64
	if json.Unmarshal(v, &f) == nil {
		return int(f)
	}
	var s string
	if json.Unmarshal(v, &s) == nil {
		n, _ = strconv.Atoi(s)
		return n
	}
	return 0
}

func rawFloat(v json.RawMessage) float64 {
	if len(v) == 0 {
		return 0
	}
	var f float64
	if json.Unmarshal(v, &f) == nil {
		return f
	}
	var s string
	if json.Unmarshal(v, &s) == nil {
		f, _ = strconv.ParseFloat(s, 64)
		return f
	}
	return 0
}

func (c *Client) Search(ctx context.Context, token string, in SearchRequest) (SearchAggregate, error) {
	result, err := c.SearchPage(ctx, token, in, 2)
	return result.Aggregate, err
}

func (c *Client) TotalItems(ctx context.Context, token string) (TotalItemsAggregate, error) {
	body, _, err := c.doGET(ctx, token, "/v1/market/total-items.json", nil, 2)
	if err != nil {
		return TotalItemsAggregate{}, err
	}
	var raw struct {
		TotalItems struct {
			Total json.RawMessage `json:"total_items"`
		} `json:"total-items"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return TotalItemsAggregate{}, errors.New("invalid Envato total-items response")
	}
	n := int64(rawInt(raw.TotalItems.Total))
	if n <= 0 {
		return TotalItemsAggregate{}, errors.New("Envato total-items response missing total_items")
	}
	return TotalItemsAggregate{TotalItems: n, ObservedAt: time.Now().UTC().Format(time.RFC3339)}, nil
}

type ConnectionStatus struct {
	OK            bool   `json:"ok"`
	Source        string `json:"source"`
	TotalItems    int64  `json:"totalItems"`
	CatalogAccess bool   `json:"catalogAccess"`
	ObservedAt    string `json:"observedAt"`
}

func (c *Client) VerifyConnection(ctx context.Context, token string) (ConnectionStatus, error) {
	aggregate, err := c.TotalItems(ctx, token)
	status := ConnectionStatus{OK: false, Source: "envato_market_api", TotalItems: aggregate.TotalItems, ObservedAt: aggregate.ObservedAt}
	if err != nil {
		return status, err
	}
	_, err = c.SearchPage(ctx, token, SearchRequest{Term: "presentation", Site: "graphicriver.net", Page: 1, PageSize: 1}, 1)
	if err != nil {
		var httpErr *HTTPStatusError
		if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusForbidden {
			return status, &TokenPermissionError{RequiredPermission: "View and search Envato sites", Cause: err}
		}
		return status, err
	}
	status.OK = true
	status.CatalogAccess = true
	return status, nil
}

func maxZero(v int) int {
	if v < 0 {
		return 0
	}
	return v
}
