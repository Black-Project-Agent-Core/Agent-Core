package analyticsengine

import (
	"context"
	"time"
)

type ComponentHealth struct {
	Component string       `json:"component"`
	Language  string       `json:"language"`
	Status    EngineStatus `json:"status"`
	Version   string       `json:"version,omitempty"`
	Protocol  string       `json:"protocol,omitempty"`
	Message   string       `json:"message,omitempty"`
}

type DiagnosticsSnapshot struct {
	ApplicationHost     ComponentHealth `json:"applicationHost"`
	ProductionAnalytics Health          `json:"productionAnalytics"`
	Protocol            string          `json:"protocol"`
	WorkerVersion       string          `json:"workerVersion,omitempty"`
	LastWorkerError     string          `json:"lastWorkerError,omitempty"`
	QuantResearchLab    ComponentHealth `json:"quantResearchLab"`
	NativeAccelerator   ComponentHealth `json:"nativeAccelerator"`
	CheckedAt           string          `json:"checkedAt"`
}

func ProductionDiagnostics(ctx context.Context, runtime *ProductionRuntime) DiagnosticsSnapshot {
	rust := Health{Status: EngineUnavailable, Engine: "rust-production", Protocol: ProtocolV1, Message: ErrRuntimeUnavailable.Error()}
	if runtime != nil {
		rust = runtime.Health(ctx)
	}
	lastErr := ""
	if rust.Status != EngineHealthy {
		lastErr = rust.Message
	}
	return DiagnosticsSnapshot{
		ApplicationHost:     ComponentHealth{Component: "application_host", Language: "Go", Status: EngineHealthy},
		ProductionAnalytics: rust,
		Protocol:            ProtocolV1,
		WorkerVersion:       rust.Version,
		LastWorkerError:     lastErr,
		QuantResearchLab:    ComponentHealth{Component: "quant_research_lab", Language: "Python", Status: EngineUnavailable, Message: "not configured"},
		NativeAccelerator:   ComponentHealth{Component: "native_accelerator", Language: "C++", Status: EngineUnavailable, Message: "not required"},
		CheckedAt:           time.Now().UTC().Format(time.RFC3339Nano),
	}
}
