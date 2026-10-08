package envato

import (
	"context"
	"time"
)

type RequestTelemetry struct {
	Site          string
	Surface       string
	HTTPStatus    int
	Latency       time.Duration
	RetryCount    int
	RetryDelay    time.Duration
	ItemsReceived int
}
type requestTelemetryContext struct {
	site, surface string
	cb            func(RequestTelemetry)
}
type requestTelemetryKey struct{}

func WithRequestTelemetry(ctx context.Context, site, surface string, cb func(RequestTelemetry)) context.Context {
	if cb == nil {
		return ctx
	}
	return context.WithValue(ctx, requestTelemetryKey{}, requestTelemetryContext{site: site, surface: surface, cb: cb})
}
func emitRequestTelemetry(ctx context.Context, v RequestTelemetry) {
	x, ok := ctx.Value(requestTelemetryKey{}).(requestTelemetryContext)
	if !ok || x.cb == nil {
		return
	}
	v.Site = x.site
	v.Surface = x.surface
	x.cb(v)
}
