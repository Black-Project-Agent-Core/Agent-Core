#!/usr/bin/env bash
set -euo pipefail

LLVM_VERSION=20
XWIN_VERSION=0.23.1
NSIS_VERSION=3.08
NSIS_SUPPORT_SHA256=1bb9fc85ee5b220d3869325dbb9d191dfe6537070f641c30fbb275c97051fd0c
NSIS_SUPPORT_URL=https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
NSIS_SUPPORT_ROOT="$HOME/.cache/agent-code/nsis/nsis-${NSIS_VERSION}"

apt_primary_source="/etc/apt/sources.list"
if [[ ! -s "$apt_primary_source" && -s /etc/apt/sources.list.d/ubuntu.sources ]]; then
  apt_primary_source="/etc/apt/sources.list.d/ubuntu.sources"
fi
[[ -s "$apt_primary_source" ]] || {
  echo 'No primary Ubuntu APT source is available for prerequisite recovery.' >&2
  exit 20
}

apt_source_args=(
  -o "Dir::Etc::sourcelist=$apt_primary_source"
  -o "Dir::Etc::sourceparts=-"
  -o "APT::Get::List-Cleanup=0"
)

missing_ubuntu_packages=()
command -v makensis >/dev/null 2>&1 || missing_ubuntu_packages+=(nsis)
command -v curl >/dev/null 2>&1 || missing_ubuntu_packages+=(curl)
command -v unzip >/dev/null 2>&1 || missing_ubuntu_packages+=(unzip)
if ((${#missing_ubuntu_packages[@]} > 0)); then
  echo "Installing Agent Code prerequisites from the primary Ubuntu source only: ${missing_ubuntu_packages[*]}"
  sudo apt-get "${apt_source_args[@]}" update
  sudo DEBIAN_FRONTEND=noninteractive apt-get "${apt_source_args[@]}" install -y "${missing_ubuntu_packages[@]}"
fi

if [[ ! -f "$NSIS_SUPPORT_ROOT/Include/Win/COM.nsh" ]] || \
   ! grep -q 'ICustomDestinationList' "$NSIS_SUPPORT_ROOT/Include/Win/COM.nsh"; then
  nsis_zip_tmp="$(mktemp)"
  nsis_extract_tmp="$(mktemp -d)"
  trap 'rm -f "$nsis_zip_tmp"; rm -rf "$nsis_extract_tmp"' EXIT

  echo "Installing pinned NSIS ${NSIS_VERSION} support tree from Tauri binary releases."
  curl --proto '=https' --tlsv1.2 -fL "$NSIS_SUPPORT_URL" -o "$nsis_zip_tmp"
  printf '%s  %s\n' "$NSIS_SUPPORT_SHA256" "$nsis_zip_tmp" | sha256sum -c -
  unzip -q "$nsis_zip_tmp" -d "$nsis_extract_tmp"
  [[ -f "$nsis_extract_tmp/nsis-${NSIS_VERSION}/Include/Win/COM.nsh" ]] || {
    echo 'Pinned NSIS support archive did not contain the expected support tree.' >&2
    exit 20
  }
  rm -rf "$NSIS_SUPPORT_ROOT"
  mkdir -p "$(dirname "$NSIS_SUPPORT_ROOT")"
  mv "$nsis_extract_tmp/nsis-${NSIS_VERSION}" "$NSIS_SUPPORT_ROOT"
fi

llvm_bindir="/usr/lib/llvm-${LLVM_VERSION}/bin"
if [[ ! -x "$llvm_bindir/clang-cl" || ! -x "$llvm_bindir/lld-link" || ! -x "$llvm_bindir/llvm-rc" || ! -x "$llvm_bindir/llvm-lib" ]]; then
  . /etc/os-release
  llvm_codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  [[ -n "$llvm_codename" ]] || {
    echo 'Unable to determine the Ubuntu codename for apt.llvm.org.' >&2
    exit 20
  }

  llvm_key="/etc/apt/trusted.gpg.d/apt.llvm.org.asc"
  llvm_key_tmp="$(mktemp)"
  llvm_sources_tmp="$(mktemp)"
  trap 'rm -f "$llvm_key_tmp" "$llvm_sources_tmp"' EXIT

  curl --proto '=https' --tlsv1.2 -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key -o "$llvm_key_tmp"
  sudo install -m 0644 "$llvm_key_tmp" "$llvm_key"

  cat "$apt_primary_source" > "$llvm_sources_tmp"
  printf 'deb [signed-by=%s] https://apt.llvm.org/%s/ llvm-toolchain-%s-%s main\n' \
    "$llvm_key" "$llvm_codename" "$llvm_codename" "$LLVM_VERSION" >> "$llvm_sources_tmp"

  llvm_apt_args=(
    -o "Dir::Etc::sourcelist=$llvm_sources_tmp"
    -o "Dir::Etc::sourceparts=-"
    -o "APT::Get::List-Cleanup=0"
  )

  echo "Installing LLVM ${LLVM_VERSION} cross-build tools from apt.llvm.org plus the primary Ubuntu source only."
  sudo apt-get "${llvm_apt_args[@]}" update
  sudo DEBIAN_FRONTEND=noninteractive apt-get "${llvm_apt_args[@]}" install -y \
    "clang-${LLVM_VERSION}" "lld-${LLVM_VERSION}" "llvm-${LLVM_VERSION}"
fi

mkdir -p "$HOME/.cargo/bin"
for tool in clang-cl lld-link llvm-rc llvm-lib; do
  [[ -x "$llvm_bindir/$tool" ]] || {
    echo "Pinned LLVM ${LLVM_VERSION} is missing required tool: $tool" >&2
    exit 20
  }
  ln -sf "$llvm_bindir/$tool" "$HOME/.cargo/bin/$tool"
done

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi

# shellcheck disable=SC1090
source "$HOME/.cargo/env"
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add x86_64-pc-windows-msvc

installed_xwin="$(cargo-xwin --version 2>/dev/null | awk '{print $2}' || true)"
if [[ "$installed_xwin" != "$XWIN_VERSION" ]]; then
  cargo install --locked --version 0.23.1 cargo-xwin
fi

npm ci
npx playwright install chromium
