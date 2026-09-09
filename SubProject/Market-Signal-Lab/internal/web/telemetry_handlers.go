package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) autopilotLive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("runId"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("runId required"))
		return
	}
	snap, ok, err := s.svc.AutopilotRuntimeSnapshot(id)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	if !ok {
		errOut(w, 404, fmt.Errorf("runtime telemetry not found"))
		return
	}
	jsonOut(w, 200, snap)
}
func (s *Server) autopilotRunLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("runId"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("runId required"))
		return
	}
	off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	lim, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if lim <= 0 {
		lim = 100
	}
	if lim > 500 {
		lim = 500
	}
	rows, total, err := s.svc.AutopilotRunLog(id, off, lim)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, map[string]any{"events": rows, "total": total, "offset": off, "limit": lim})
}
func (s *Server) autopilotRuntimeHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	lim, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if lim <= 0 {
		lim = 20
	}
	rows, err := s.svc.AutopilotRuntimeHistory(lim)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, rows)
}
func (s *Server) autopilotLiveEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("runId"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("runId required"))
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		errOut(w, 500, fmt.Errorf("streaming unsupported"))
		return
	}
	snap, exists, err := s.svc.AutopilotRuntimeSnapshot(id)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	if !exists {
		errOut(w, 404, fmt.Errorf("runtime telemetry not found"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	writeSSE := func(name string, v any) {
		b, _ := json.Marshal(v)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, b)
		flusher.Flush()
	}
	writeSSE("snapshot", snap)
	ch, cancel, subErr := s.svc.SubscribeAutopilotTelemetry(id)
	if subErr != nil {
		writeSSE("terminal", snap)
		return
	}
	defer cancel()
	heartbeat := time.NewTicker(10 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case ev, open := <-ch:
			if !open {
				if final, ok, _ := s.svc.AutopilotRuntimeSnapshot(id); ok {
					writeSSE("terminal", final)
				}
				return
			}
			writeSSE("telemetry", ev)
			if current, ok, _ := s.svc.AutopilotRuntimeSnapshot(id); ok {
				writeSSE("snapshot", current)
			}
		case <-heartbeat.C:
			fmt.Fprint(w, ": heartbeat\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
