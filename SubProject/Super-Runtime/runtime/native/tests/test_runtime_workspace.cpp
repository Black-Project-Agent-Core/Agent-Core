#include "super_runtime/runtime_workspace.h"

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

using super_runtime::RuntimeWorkspaceRequirements;
using super_runtime::RuntimeWorkspaceResult;
using super_runtime::plan_cpu_dense_workspace;
using super_runtime::runtime_workspace_fits_budget;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "runtime-workspace test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

} // namespace

int main() {
    RuntimeWorkspaceRequirements width32{};
    require(plan_cpu_dense_workspace(32, width32) == RuntimeWorkspaceResult::Ok,
            "width-32 dense workspace must be measurable");
    require(width32.metadata_bytes != 0,
            "dense workspace must report nonzero GGML metadata bytes");
    require(width32.compute_buffer_bytes != 0,
            "dense workspace must report nonzero GGML compute-buffer bytes");

    RuntimeWorkspaceRequirements repeated{};
    require(plan_cpu_dense_workspace(32, repeated) == RuntimeWorkspaceResult::Ok,
            "repeated width-32 workspace measurement must succeed");
    require(repeated.metadata_bytes == width32.metadata_bytes &&
                repeated.compute_buffer_bytes == width32.compute_buffer_bytes,
            "workspace measurement must be deterministic");

    RuntimeWorkspaceRequirements width64{};
    require(plan_cpu_dense_workspace(64, width64) == RuntimeWorkspaceResult::Ok,
            "width-64 dense workspace must be measurable");
    require(width64.metadata_bytes == width32.metadata_bytes,
            "metadata graph shape must not grow merely because matrix width changes");
    require(width64.compute_buffer_bytes > width32.compute_buffer_bytes,
            "larger dense width must require a larger compute buffer");

    require(runtime_workspace_fits_budget(
                width32.metadata_bytes,
                width32.compute_buffer_bytes,
                width32),
            "exactly provisioned runtime/compute buckets must cover measured workspace");
    require(!runtime_workspace_fits_budget(
                width32.metadata_bytes - 1,
                width32.compute_buffer_bytes,
                width32),
            "runtime-overhead bucket one byte below measured metadata must be rejected");
    require(!runtime_workspace_fits_budget(
                width32.metadata_bytes,
                width32.compute_buffer_bytes - 1,
                width32),
            "compute-scratch bucket one byte below measured buffer must be rejected");
    RuntimeWorkspaceRequirements invalid{123, 456};
    require(plan_cpu_dense_workspace(0, invalid) == RuntimeWorkspaceResult::InvalidArgument,
            "zero width must fail closed");
    require(invalid.metadata_bytes == 0 && invalid.compute_buffer_bytes == 0,
            "failed workspace planning must publish no partial requirements");

    std::cout << "runtime-workspace width32 metadata=" << width32.metadata_bytes
              << " compute=" << width32.compute_buffer_bytes << '\n';
    std::cout << "runtime-workspace tests: PASS\n";
    return 0;
}
