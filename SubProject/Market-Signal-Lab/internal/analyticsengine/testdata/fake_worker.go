package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

type request struct {
	Protocol string          `json:"protocol"`
	ID       string          `json:"id"`
	Op       string          `json:"op"`
	Input    json.RawMessage `json:"input"`
}

type response struct {
	Protocol       string         `json:"protocol"`
	ID             string         `json:"id"`
	OK             bool           `json:"ok"`
	Engine         string         `json:"engine"`
	EngineVersion  string         `json:"engineVersion"`
	DurationMicros uint64         `json:"durationMicros"`
	Result         map[string]any `json:"result,omitempty"`
	Error          map[string]any `json:"error,omitempty"`
}

func main() {
	mode := os.Getenv("FAKE_WORKER_MODE")
	s := bufio.NewScanner(os.Stdin)
	for s.Scan() {
		var req request
		if err := json.Unmarshal(s.Bytes(), &req); err != nil {
			continue
		}
		switch mode {
		case "hang":
			time.Sleep(30 * time.Second)
			continue
		case "exit":
			fmt.Fprintln(os.Stderr, "Authorization: Bearer fake-secret-token")
			os.Exit(23)
		case "malformed":
			fmt.Println("{not-json")
			continue
		}
		id := req.ID
		if mode == "mismatch_id" {
			id = "wrong-id"
		}
		result := map[string]any{}
		switch req.Op {
		case "capabilities":
			result = map[string]any{"protocol": "msl-analytics/1", "capabilities": []string{"distribution_similarity", "item_volatility", "cluster_volatility", "selection_probability"}}
		case "distribution_similarity":
			result = map[string]any{"score": 42.5}
		default:
			result = map[string]any{"score": 1.0}
		}
		b, _ := json.Marshal(response{Protocol: "msl-analytics/1", ID: id, OK: true, Engine: "rust-native", EngineVersion: "0.1.0", DurationMicros: 17, Result: result})
		fmt.Println(string(b))
	}
}
