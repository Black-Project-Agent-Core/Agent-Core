package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io/fs"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func leakageCanary() string {
	return "MSL_TEST_" + "SECRET_DO_NOT_LEAK_" + "7F83C91A5E2D"
}

func TestEnvatoCredentialCanaryDoesNotLeakToLocalResearchDataOrExport(t *testing.T) {
	canary := leakageCanary()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+canary {
			t.Fatalf("authorization header mismatch")
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
		case "/v1/discovery/search/search/item":
			if r.URL.Query().Get("term") == "presentation" {
				_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":1,"name":"Probe"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":8123,"name":"Leakage Gate Template","author_username":"public-author","url":"https://example.test/8123","category":"presentation-templates"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer api.Close()

	root := filepath.Join(t.TempDir(), "data")
	st, err := storage.Open(root)
	if err != nil { t.Fatal(err) }
	vault := &credentialMemoryStore{secret: canary, found: true}
	manager := credentialspkg.NewManager(vault, st.Root(), func(string) string { return "" }, credentialspkg.DefaultEnvName)
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL), envatoconn.WithSleep(func(time.Duration) {}))
	svc := NewWithEnvatoClientAndAnalyticsEngineAndCredentials(st, client, &appTestEngine{name: "secret-leak-gate-rust"}, manager)
	defer svc.Close()

	status, err := svc.TestEnvatoConnection(context.Background())
	if err != nil { t.Fatal(err) }
	statusJSON, _ := json.Marshal(status)
	if bytes.Contains(statusJSON, []byte(canary)) { t.Fatal("connection status leaked credential") }

	result, err := svc.RunEnvatoMarketScan(context.Background(), domain.MarketScanRequest{
		Catalog: domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Leakage Gate"},
		Keywords: []string{"leakage gate"}, Site: "graphicriver.net", Category: "presentation-templates",
		MaxPages: 1, PageSize: 20, RequestBudget: 2,
	})
	if err != nil { t.Fatal(err) }
	resultJSON, _ := json.Marshal(result)
	if bytes.Contains(resultJSON, []byte(canary)) { t.Fatal("scanner result leaked credential") }

	exported, err := svc.Export()
	if err != nil { t.Fatal(err) }
	exportJSON, err := json.Marshal(exported)
	if err != nil { t.Fatal(err) }
	if bytes.Contains(exportJSON, []byte(canary)) { t.Fatal("export bundle leaked credential") }

	var leaked []string
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil { return walkErr }
		if entry.IsDir() { return nil }
		data, readErr := os.ReadFile(path)
		if readErr != nil { return readErr }
		if bytes.Contains(data, []byte(canary)) { leaked = append(leaked, strings.TrimPrefix(path, root+string(os.PathSeparator))) }
		return nil
	})
	if err != nil { t.Fatal(err) }
	if len(leaked) != 0 { t.Fatalf("credential leaked into local data files: %v", leaked) }
}

func TestPublicEnvatoRequestContractsHaveNoTokenField(t *testing.T) {
	for _, value := range []any{domain.MarketScanRequest{}, ObserveEnvatoQueryRequest{}} {
		raw, err := json.Marshal(value)
		if err != nil { t.Fatal(err) }
		if bytes.Contains(bytes.ToLower(raw), []byte(`"token"`)) { t.Fatalf("public request contract contains token field: %T %s", value, raw) }
	}
}
