package web

import (
	"embed"
	"io/fs"
)

//go:embed templates/index.html assets/css/*.css assets/js/*.js
var webAssets embed.FS

var indexHTML = mustReadEmbedded("templates/index.html")
var workspaceJS = mustReadEmbedded("assets/js/workspace.js")
var appJS = mustReadEmbedded("assets/js/app.js")
var consensusJS = mustReadEmbedded("assets/js/consensus.js")
var telemetryJS = mustReadEmbedded("assets/js/telemetry.js")
var analyticsEngineJS = mustReadEmbedded("assets/js/analytics_engine.js")
var uiSource = indexHTML + "\n" + workspaceJS + "\n" + consensusJS + "\n" + telemetryJS + "\n" + analyticsEngineJS + "\n" + appJS

func mustReadEmbedded(name string) string {
	data, err := webAssets.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return string(data)
}

func embeddedAssetFS() fs.FS {
	sub, err := fs.Sub(webAssets, "assets")
	if err != nil {
		panic(err)
	}
	return sub
}
