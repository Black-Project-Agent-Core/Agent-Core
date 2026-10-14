#!/usr/bin/env bash
set -eo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(cd "$script_dir/../.." && pwd -P)"
repo_root="$(git -C "$project_root" rev-parse --show-toplevel)"
relative_project="${project_root#"$repo_root"/}"
llama_rel="$relative_project/research/references/llama.cpp"

fail() {
  printf 'native-substrate contract: FAIL: %s\n' "$*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing ${1#"$project_root"/}"
}

require_file "$project_root/CMakeLists.txt"
require_file "$project_root/runtime/native/CMakeLists.txt"
require_file "$project_root/runtime/native/README.md"
require_file "$project_root/runtime/native/LLAMA_CPP_REVISION"
require_file "$project_root/runtime/native/smoke.cpp"

pinned_revision="$(tr -d '[:space:]' < "$project_root/runtime/native/LLAMA_CPP_REVISION")"
printf '%s\n' "$pinned_revision" | grep -Eq '^[0-9a-f]{40}$' \
  || fail "LLAMA_CPP_REVISION must contain one full 40-hex commit SHA"

repo_pin="$(git -C "$repo_root" ls-tree HEAD "$llama_rel" | awk '{print $3}')"
[ -n "$repo_pin" ] || fail "cannot resolve gitlink for $llama_rel"
[ "$pinned_revision" = "$repo_pin" ] || fail "native revision $pinned_revision differs from repository gitlink $repo_pin"

llama_dir="$project_root/research/references/llama.cpp"
[ -f "$llama_dir/CMakeLists.txt" ] || fail "pinned llama.cpp submodule is not initialized"
actual_revision="$(git -C "$llama_dir" rev-parse HEAD)"
[ "$actual_revision" = "$pinned_revision" ] || fail "initialized llama.cpp revision $actual_revision differs from $pinned_revision"

build_dir="${SR_NATIVE_BUILD_DIR:-$project_root/.build/native-contract}"
rm -rf "$build_dir"
mkdir -p "$(dirname "$build_dir")"

generator_args=()
if command -v ninja >/dev/null 2>&1; then
  generator_args=(-G Ninja)
fi
build_jobs="${SR_BUILD_JOBS:-$(nproc)}"

cmake "${generator_args[@]}" \
  -S "$project_root" \
  -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DSUPER_RUNTIME_LLAMA_SOURCE="$llama_dir" \
  -DGGML_CUDA=OFF \
  -DGGML_VULKAN=OFF \
  -DGGML_METAL=OFF \
  -DGGML_SYCL=OFF \
  -DGGML_HIP=OFF \
  -DGGML_OPENCL=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=OFF \
  -DLLAMA_BUILD_TOOLS=OFF \
  >"$build_dir.configure.log" 2>&1 \
  || { cat "$build_dir.configure.log" >&2; fail "CMake configure failed"; }

cmake --build "$build_dir" --target super-runtime-native-smoke --parallel "$build_jobs" \
  >"$build_dir.build.log" 2>&1 \
  || { cat "$build_dir.build.log" >&2; fail "CPU smoke target build failed"; }

smoke="$build_dir/runtime/native/super-runtime-native-smoke"
[ -x "$smoke" ] || fail "smoke executable was not produced at expected path"

output="$($smoke)" || fail "smoke executable returned non-zero"
printf '%s\n' "$output"
printf '%s\n' "$output" | grep -Fq 'super-runtime-native-smoke: PASS' || fail "smoke did not report PASS"
printf '%s\n' "$output" | grep -Fq "llama.cpp revision: $pinned_revision" || fail "smoke did not report pinned llama.cpp revision"
printf '%s\n' "$output" | grep -Fq 'backend: CPU' || fail "smoke did not report CPU backend"

printf 'native-substrate contract: PASS revision=%s\n' "$pinned_revision"
