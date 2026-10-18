// Agent Core's internal IPC adapter for the installed Open Browser Use host.
// It carries the donor's framed bytes, including notifications; it is not an MCP server.
package main

import (
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"
)

func main() {
	socketPath := flag.String("socket", "", "absolute path of the existing native-host socket")
	flag.Parse()
	if flag.NArg() != 0 || !filepath.IsAbs(*socketPath) {
		fmt.Fprintln(os.Stderr, "BROWSER_OBU_SOCKET_PATH_REQUIRED")
		os.Exit(2)
	}
	info, err := os.Lstat(*socketPath)
	if err != nil || info.Mode()&os.ModeType != os.ModeSocket {
		fmt.Fprintln(os.Stderr, "BROWSER_OBU_SOCKET_TYPE_INVALID")
		os.Exit(2)
	}
	conn, err := net.DialTimeout("unix", *socketPath, 3*time.Second)
	if err != nil {
		fmt.Fprintln(os.Stderr, "BROWSER_OBU_CONNECT_FAILED")
		os.Exit(1)
	}
	defer conn.Close()
	done := make(chan error, 2)
	go func() { _, err := io.Copy(conn, os.Stdin); done <- err }()
	go func() { _, err := io.Copy(os.Stdout, conn); done <- err }()
	err = <-done
	_ = conn.Close()
	if err != nil {
		fmt.Fprintln(os.Stderr, "BROWSER_OBU_PIPE_CLOSED")
		os.Exit(1)
	}
}
