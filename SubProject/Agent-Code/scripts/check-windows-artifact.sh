#!/usr/bin/env bash
set -euo pipefail

TARGET_ROOT="src-tauri/target/x86_64-pc-windows-msvc/release"
APP="$TARGET_ROOT/agent-code.exe"
INSTALLER="$TARGET_ROOT/bundle/nsis/Agent Code_0.1.0_x64-setup.exe"

[[ -f "$APP" ]] || { echo "Missing Windows app executable: $APP" >&2; exit 30; }
[[ -f "$INSTALLER" ]] || { echo "Missing Windows NSIS installer: $INSTALLER" >&2; exit 30; }

llvm-readobj-20 --file-headers "$APP" | grep -q 'IMAGE_FILE_MACHINE_AMD64' || {
  echo 'Windows app is not AMD64 PE.' >&2
  exit 30
}

imports="$(llvm-readobj-20 --coff-imports "$APP")"
if grep -q 'TaskDialogIndirect' <<<"$imports"; then
  resource_rc="$(find "$TARGET_ROOT/build" -path '*agent-code*/out/resource-preprocessed.rc' -type f -print | head -n 1)"
  [[ -n "$resource_rc" && -f "$resource_rc" ]] || {
    echo 'Could not locate generated Windows resource manifest.' >&2
    exit 30
  }
  grep -q 'Microsoft.Windows.Common-Controls' "$resource_rc" || {
    echo 'TaskDialogIndirect is imported but Common Controls v6 is absent from the generated Windows manifest.' >&2
    exit 30
  }
  grep -q '6.0.0.0' "$resource_rc" || {
    echo 'Common Controls v6 manifest dependency has an unexpected version.' >&2
    exit 30
  }
fi

file "$INSTALLER" | grep -q 'Nullsoft Installer' || {
  echo 'Windows setup artifact is not an NSIS installer.' >&2
  exit 30
}

printf 'windows-artifact-contract: PASS\n'
