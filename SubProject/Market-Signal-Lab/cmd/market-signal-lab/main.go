package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	webui "marketsignallab/internal/web"
)

const appVersion = "0.3.0-alpha.6.5.3-preview.1"
const version = appVersion

type config struct {
	Command  string
	Port     int
	DataDir  string
	NoOpen   bool
	TokenEnv string
	Mode     domain.MarketMapMode
}

func parseArgs(args []string) (config, error) {
	c := config{Command: "serve", Port: 17771, TokenEnv: credentialspkg.DefaultEnvName, Mode: domain.MarketMapModeStandard}
	if len(args) > 0 && (args[0] == "serve" || args[0] == "market-map" || args[0] == "version" || args[0] == "capture-helper-path") {
		c.Command = args[0]
		args = args[1:]
	}
	if c.Command == "version" || c.Command == "capture-helper-path" {
		return c, nil
	}
	fs := flag.NewFlagSet(c.Command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.IntVar(&c.Port, "port", 17771, "local dashboard port")
	fs.StringVar(&c.DataDir, "data-dir", "", "data directory override")
	fs.BoolVar(&c.NoOpen, "no-open", false, "do not open the browser")
	mode := string(c.Mode)
	if c.Command == "market-map" {
		fs.StringVar(&c.TokenEnv, "token-env", credentialspkg.DefaultEnvName, "environment variable checked before the saved Envato credential")
		fs.StringVar(&mode, "mode", string(domain.MarketMapModeStandard), "market map mode: quick, standard, or deep")
	}
	if err := fs.Parse(args); err != nil {
		return c, err
	}
	if fs.NArg() != 0 {
		return c, fmt.Errorf("unexpected command or argument: %s", fs.Arg(0))
	}
	if c.Port < 1 || c.Port > 65535 {
		return c, errors.New("port must be between 1 and 65535")
	}
	if c.Command == "market-map" {
		c.TokenEnv = strings.TrimSpace(c.TokenEnv)
		if c.TokenEnv == "" {
			return c, errors.New("token-env is required")
		}
		c.Mode = domain.MarketMapMode(strings.TrimSpace(mode))
		if c.Mode != domain.MarketMapModeQuick && c.Mode != domain.MarketMapModeStandard && c.Mode != domain.MarketMapModeDeep {
			return c, errors.New("mode must be quick, standard, or deep")
		}
	}
	return c, nil
}

var runtimeCredentialManagerFactory = func(dataRoot, envName string) *credentialspkg.Manager {
	return credentialspkg.NewDefaultManager(dataRoot, envName)
}

func newServiceForRuntime(st *storage.Store, tokenEnv string) *app.Service {
	manager := runtimeCredentialManagerFactory(st.Root(), tokenEnv)
	baseURL := strings.TrimSpace(os.Getenv("MARKET_SIGNAL_LAB_ENVATO_BASE_URL"))
	if baseURL == "" {
		return app.NewWithCredentialManager(st, manager)
	}
	return app.NewWithEnvatoClientAndCredentialManager(st, envatoconn.NewClient(envatoconn.WithBaseURL(baseURL)), manager)
}

func main() {
	if code := run(os.Args[1:], os.Stdout, os.Stderr); code != 0 {
		os.Exit(code)
	}
}

func run(args []string, stdout, stderr io.Writer) int {
	c, err := parseArgs(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	if c.Command == "version" {
		fmt.Fprintln(stdout, version)
		return 0
	}
	if c.Command == "capture-helper-path" {
		exe, e := os.Executable()
		if e != nil {
			fmt.Fprintln(stderr, e)
			return 1
		}
		fmt.Fprintln(stdout, filepath.Join(filepath.Dir(exe), "browser-companion"))
		return 0
	}
	dataDir := storage.ResolveDataDir(c.DataDir)
	st, err := storage.Open(dataDir)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	logPath := dataDir + string(os.PathSeparator) + "logs" + string(os.PathSeparator) + "app.log"
	if lf, e := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); e == nil {
		defer lf.Close()
		log.SetOutput(lf)
	}
	svc := newServiceForRuntime(st, c.TokenEnv)
	defer svc.Close()
	addr := "127.0.0.1:" + strconv.Itoa(c.Port)
	url := "http://" + addr + "/"
	if c.Command == "market-map" {
		if runningVersion := probeRunningVersion(url); runningVersion != "" {
			fmt.Fprintf(stderr, "another Market Signal Lab instance (%s) is already running at %s. Close the older instance completely, then run this market map again.\n", runningVersion, url)
			return 1
		}
		if _, err := svc.ReconcileInterruptedAutopilotRuns(); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		view, err := svc.RunMarketAutopilot(context.Background(), c.Mode)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		summary := map[string]any{"version": version, "run": view.Run, "catalogs": len(view.Catalogs), "productDirections": len(view.Directions), "productionInsights": len(view.Insights), "saturationAlerts": len(view.Alerts)}
		if err := json.NewEncoder(stdout).Encode(summary); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return 0
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		if runningVersion := probeRunningVersion(url); runningVersion != "" {
			fmt.Fprintf(stderr, "another Market Signal Lab instance (%s) is already running at %s. Close the older instance completely, then start this version again. The browser was not opened.\n", runningVersion, url)
		} else {
			fmt.Fprintf(stderr, "cannot start Market Signal Lab at %s: %v\n", url, err)
		}
		return 1
	}
	defer listener.Close()
	if _, err := svc.ReconcileInterruptedAutopilotRuns(); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	srv := &http.Server{Addr: addr, Handler: webui.New(svc).Handler(), ReadHeaderTimeout: 5 * time.Second}
	if !c.NoOpen {
		go func() { time.Sleep(450 * time.Millisecond); _ = openBrowser(url) }()
	}
	log.Printf("starting Market Signal Lab %s at %s data=%s", version, url, dataDir)
	fmt.Fprintf(stdout, "Market Signal Lab %s\n%s\nData: %s\n", version, url, dataDir)
	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(stderr, err)
		log.Printf("server error: %v", err)
		return 1
	}
	return 0
}

func probeRunningVersion(baseURL string) string {
	client := &http.Client{Timeout: 750 * time.Millisecond}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + "/api/health")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	var payload struct {
		App     string `json:"app"`
		Version string `json:"version"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&payload); err != nil {
		return ""
	}
	if payload.App != "Market Signal Lab" {
		return ""
	}
	return strings.TrimSpace(payload.Version)
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
