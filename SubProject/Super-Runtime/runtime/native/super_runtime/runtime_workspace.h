#pragma once

#include <cstddef>
#include <cstdint>

namespace super_runtime {

inline constexpr std::size_t runtime_dense_graph_size = 8;

struct RuntimeWorkspaceRequirements {
    std::uint64_t metadata_bytes = 0;
    std::uint64_t compute_buffer_bytes = 0;
};

enum class RuntimeWorkspaceResult : std::uint8_t {
    Ok = 0,
    InvalidArgument,
    Overflow,
    ComputeError,
};

[[nodiscard]] RuntimeWorkspaceResult plan_cpu_dense_workspace(
    std::uint64_t width,
    RuntimeWorkspaceRequirements & requirements) noexcept;

[[nodiscard]] bool runtime_workspace_fits_budget(
    std::uint64_t runtime_overhead_bytes,
    std::uint64_t compute_scratch_bytes,
    const RuntimeWorkspaceRequirements & requirements) noexcept;


} // namespace super_runtime
