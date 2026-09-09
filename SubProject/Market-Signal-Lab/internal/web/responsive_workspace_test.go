package web

import (
	"strings"
	"testing"
)

func TestResponsiveWorkspaceUsesEmbeddedAssets(t *testing.T) {
	for _, want := range []string{
		`/assets/css/tokens.css`,
		`/assets/css/workspace.css`,
		`/assets/css/components.css`,
		`/assets/css/responsive.css`,
		`/assets/js/workspace.js`,
		`/assets/js/app.js`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("home missing embedded asset reference %q", want)
		}
	}
}

func TestResponsiveWorkspaceHasSidebarAndStickyTopbar(t *testing.T) {
	for _, want := range []string{
		`id="appSidebar"`,
		`id="appWorkspace"`,
		`id="workspaceTopbar"`,
		`id="sidebarToggle"`,
		`id="sidebarBackdrop"`,
		`class="sidebar-nav"`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("responsive workspace missing %q", want)
		}
	}
	if strings.Contains(indexHTML, `class="tabs"`) {
		t.Fatal("legacy pill navigation must not remain the primary app navigation")
	}
}

func TestResponsiveWorkspaceExposesDensityPreference(t *testing.T) {
	for _, want := range []string{
		`id="densitySelect"`,
		`const DENSITY_STORAGE_KEY='msl.displayDensity'`,
		`function setDisplayDensity`,
		`value="comfortable"`,
		`value="compact"`,
	} {
		if !strings.Contains(uiSource, want) {
			t.Fatalf("density contract missing %q", want)
		}
	}
}

func TestResponsiveWorkspaceContainsAdaptiveTableContracts(t *testing.T) {
	for _, want := range []string{
		`class="table-wrap adaptive-table"`,
		`data-label=`,
		`priority-1`,
		`priority-2`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("adaptive table contract missing %q", want)
		}
	}
}

func TestSidebarLinksPreserveIconAndLabelStructureDuringLocalization(t *testing.T) {
	if strings.Contains(indexHTML, `class="sidebar-link active" data-i18n=`) || strings.Contains(indexHTML, `class="sidebar-link" data-i18n=`) {
		t.Fatal("sidebar links must not translate the anchor node itself because that destroys icon and label children")
	}
	for _, want := range []string{`class="nav-icon"`, `class="nav-label"`, `data-section-title-key=`} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("sidebar localization structure missing %q", want)
		}
	}
}
