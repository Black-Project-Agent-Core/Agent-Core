//go:build analyticsbench

package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"marketsignallab/internal/analyticsengine"
	"os"
	"sort"
	"time"
)

type benchmarkMetric struct {
	Engine                 string  `json:"engine"`
	Observations           int     `json:"observations"`
	Iterations             int     `json:"iterations"`
	MedianMicros           int64   `json:"medianMicros"`
	P95Micros              int64   `json:"p95Micros"`
	ThroughputObsPerSecond float64 `json:"throughputObsPerSecond"`
}

type benchmarkDocument struct {
	Status            string                               `json:"status"`
	Protocol          string                               `json:"protocol"`
	WorkerPath        string                               `json:"workerPath"`
	RustHealth        analyticsengine.Health               `json:"rustHealth"`
	RustStartupMicros int64                                `json:"rustStartupMicros"`
	Parity            []analyticsengine.ParityCorpusReport `json:"parity,omitempty"`
	Benchmarks        []benchmarkMetric                    `json:"benchmarks,omitempty"`
	Message           string                               `json:"message"`
}

func main() { os.Exit(runBenchmark(os.Args[1:], os.Stdout)) }

func runBenchmark(args []string, out io.Writer) int {
	fs := flag.NewFlagSet("analytics-bench", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	worker := fs.String("worker", analyticsengine.DefaultRustWorkerPath(), "path to msl-analytics-rust worker")
	iterations := fs.Int("iterations", 5, "benchmark iterations after parity passes")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(out, "error: %v\n", err)
		return 64
	}
	if *iterations < 1 {
		*iterations = 1
	}

	ctx := context.Background()
	start := time.Now()
	rust := analyticsengine.NewRustEngine(ctx, *worker, 90*time.Second)
	startup := time.Since(start)
	defer rust.Close()

	doc := benchmarkDocument{
		Status:            "blocked",
		Protocol:          analyticsengine.ProtocolV1,
		WorkerPath:        *worker,
		RustHealth:        rust.Health(ctx),
		RustStartupMicros: startup.Microseconds(),
		Message:           "Rust parity gate blocked: a healthy compiled Rust worker is required before performance measurements may be published.",
	}
	if doc.RustHealth.Status != analyticsengine.EngineHealthy {
		writeJSON(out, doc)
		return 2
	}

	goEngine := newBenchmarkReferenceEngine()
	for _, size := range []int{10_000, 100_000, 1_000_000} {
		corpus := analyticsengine.BuildDeterministicCorpus(size)
		report := analyticsengine.RunParityCorpus(ctx, goEngine, rust, corpus)
		doc.Parity = append(doc.Parity, report)
		if !analyticsengine.BenchmarkGateOpen(report) {
			doc.Message = fmt.Sprintf("Rust parity gate blocked at %d observations; no performance claim was produced.", size)
			writeJSON(out, doc)
			return 3
		}
	}

	doc.Status = "verified"
	doc.Message = "Rust parity passed at 10K, 100K, and 1M observations. Performance measurements are eligible to be recorded as evidence."
	for _, report := range doc.Parity {
		corpus := analyticsengine.BuildDeterministicCorpus(report.Observations)
		doc.Benchmarks = append(doc.Benchmarks,
			measureEngine(ctx, goEngine, corpus, *iterations),
			measureEngine(ctx, rust, corpus, *iterations),
		)
	}
	writeJSON(out, doc)
	return 0
}

func measureEngine(ctx context.Context, engine analyticsengine.Engine, corpus analyticsengine.ParityCorpus, iterations int) benchmarkMetric {
	durations := make([]time.Duration, 0, iterations)
	for i := 0; i < iterations; i++ {
		started := time.Now()
		_, _ = engine.DistributionSimilarity(ctx, corpus.Distribution)
		_, _ = engine.ItemVolatility(ctx, corpus.Item)
		_, _ = engine.ClusterVolatility(ctx, corpus.Cluster)
		_, _ = engine.SelectionProbability(ctx, corpus.Selection)
		durations = append(durations, time.Since(started))
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	median := durations[len(durations)/2]
	p95Index := int(float64(len(durations)-1) * .95)
	p95 := durations[p95Index]
	throughput := 0.0
	if median > 0 {
		throughput = float64(corpus.Observations) / median.Seconds()
	}
	return benchmarkMetric{Engine: engine.Name(), Observations: corpus.Observations, Iterations: iterations, MedianMicros: median.Microseconds(), P95Micros: p95.Microseconds(), ThroughputObsPerSecond: throughput}
}

func writeJSON(out io.Writer, doc benchmarkDocument) {
	enc := json.NewEncoder(out)
	enc.SetIndent("", "  ")
	_ = enc.Encode(doc)
}
