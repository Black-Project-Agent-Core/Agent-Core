#pragma once

#include <cstdint>

namespace super_runtime {

struct RuntimeBudgetRequest {
    std::uint64_t host_ceiling_bytes = 0;
    std::uint64_t runtime_overhead_bytes = 0;
    std::uint64_t mandatory_weights_bytes = 0;
    std::uint64_t context_state_bytes = 0;
    std::uint64_t compute_scratch_bytes = 0;
    std::uint64_t staging_bytes = 0;
    std::uint64_t safety_reserve_bytes = 0;

    std::uint64_t dense_min_bytes = 0;
    std::uint64_t dense_preferred_bytes = 0;
    std::uint64_t moe_min_bytes = 0;
    std::uint64_t moe_preferred_bytes = 0;
    std::uint8_t dense_share_percent = 50;

    std::uint64_t device_memory_available_bytes = 0;
    std::uint64_t device_memory_requested_bytes = 0;
};

struct RuntimeBudgetPlan {
    std::uint64_t host_ceiling_bytes = 0;
    std::uint64_t mandatory_host_bytes = 0;
    std::uint64_t dynamic_weight_budget_bytes = 0;
    std::uint64_t dense_residency_bytes = 0;
    std::uint64_t moe_residency_bytes = 0;
    std::uint64_t host_planned_bytes = 0;
    std::uint64_t unallocated_host_bytes = 0;
    std::uint64_t device_memory_bytes = 0;
};

enum class RuntimeBudgetResult : std::uint8_t {
    Ok = 0,
    InvalidArgument,
    HostBudgetExceeded,
    DeviceBudgetExceeded,
    Overflow,
};

[[nodiscard]] RuntimeBudgetResult plan_runtime_budget(
    const RuntimeBudgetRequest & request,
    RuntimeBudgetPlan & plan) noexcept;

} // namespace super_runtime
