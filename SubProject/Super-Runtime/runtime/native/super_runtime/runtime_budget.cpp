#include "runtime_budget.h"

#include <algorithm>
#include <cstdint>
#include <limits>

namespace super_runtime {
namespace {

bool add_checked(std::uint64_t value, std::uint64_t increment, std::uint64_t & out) noexcept {
    if (increment > std::numeric_limits<std::uint64_t>::max() - value) {
        return false;
    }
    out = value + increment;
    return true;
}

bool add_into(std::uint64_t & value, std::uint64_t increment) noexcept {
    std::uint64_t next = 0;
    if (!add_checked(value, increment, next)) {
        return false;
    }
    value = next;
    return true;
}

std::uint64_t capped_headroom(std::uint64_t minimum, std::uint64_t preferred) noexcept {
    return preferred - minimum;
}

void distribute_discretionary(
        std::uint64_t discretionary,
        std::uint8_t dense_share_percent,
        std::uint64_t dense_headroom,
        std::uint64_t moe_headroom,
        std::uint64_t & dense_extra,
        std::uint64_t & moe_extra) noexcept {
    const std::uint64_t dense_target = (discretionary / 100U) * dense_share_percent
        + ((discretionary % 100U) * dense_share_percent) / 100U;
    const std::uint64_t moe_target = discretionary - dense_target;

    dense_extra = std::min(dense_target, dense_headroom);
    moe_extra = std::min(moe_target, moe_headroom);

    std::uint64_t consumed = dense_extra + moe_extra;
    std::uint64_t spare = discretionary - consumed;

    if (spare != 0 && dense_extra < dense_headroom) {
        const std::uint64_t add = std::min(spare, dense_headroom - dense_extra);
        dense_extra += add;
        spare -= add;
    }
    if (spare != 0 && moe_extra < moe_headroom) {
        const std::uint64_t add = std::min(spare, moe_headroom - moe_extra);
        moe_extra += add;
    }
}

} // namespace

RuntimeBudgetResult plan_runtime_budget(
        const RuntimeBudgetRequest & request,
        RuntimeBudgetPlan & plan) noexcept {
    plan = {};

    if (request.host_ceiling_bytes == 0 || request.dense_share_percent > 100 ||
        request.dense_preferred_bytes < request.dense_min_bytes ||
        request.moe_preferred_bytes < request.moe_min_bytes) {
        return RuntimeBudgetResult::InvalidArgument;
    }

    if (request.device_memory_requested_bytes > request.device_memory_available_bytes) {
        return RuntimeBudgetResult::DeviceBudgetExceeded;
    }

    std::uint64_t mandatory = 0;
    if (!add_into(mandatory, request.runtime_overhead_bytes) ||
        !add_into(mandatory, request.mandatory_weights_bytes) ||
        !add_into(mandatory, request.context_state_bytes) ||
        !add_into(mandatory, request.compute_scratch_bytes) ||
        !add_into(mandatory, request.staging_bytes) ||
        !add_into(mandatory, request.safety_reserve_bytes)) {
        return RuntimeBudgetResult::Overflow;
    }

    if (mandatory > request.host_ceiling_bytes) {
        return RuntimeBudgetResult::HostBudgetExceeded;
    }

    const std::uint64_t dynamic_budget = request.host_ceiling_bytes - mandatory;

    std::uint64_t dynamic_minimum = 0;
    if (!add_into(dynamic_minimum, request.dense_min_bytes) ||
        !add_into(dynamic_minimum, request.moe_min_bytes)) {
        return RuntimeBudgetResult::Overflow;
    }
    if (dynamic_minimum > dynamic_budget) {
        return RuntimeBudgetResult::HostBudgetExceeded;
    }

    const std::uint64_t discretionary = dynamic_budget - dynamic_minimum;
    const std::uint64_t dense_headroom = capped_headroom(request.dense_min_bytes, request.dense_preferred_bytes);
    const std::uint64_t moe_headroom = capped_headroom(request.moe_min_bytes, request.moe_preferred_bytes);

    std::uint64_t dense_extra = 0;
    std::uint64_t moe_extra = 0;
    distribute_discretionary(
        discretionary,
        request.dense_share_percent,
        dense_headroom,
        moe_headroom,
        dense_extra,
        moe_extra);

    std::uint64_t dense_bytes = 0;
    std::uint64_t moe_bytes = 0;
    if (!add_checked(request.dense_min_bytes, dense_extra, dense_bytes) ||
        !add_checked(request.moe_min_bytes, moe_extra, moe_bytes)) {
        return RuntimeBudgetResult::Overflow;
    }

    std::uint64_t host_planned = mandatory;
    if (!add_into(host_planned, dense_bytes) || !add_into(host_planned, moe_bytes)) {
        return RuntimeBudgetResult::Overflow;
    }
    if (host_planned > request.host_ceiling_bytes) {
        return RuntimeBudgetResult::HostBudgetExceeded;
    }

    plan.host_ceiling_bytes = request.host_ceiling_bytes;
    plan.mandatory_host_bytes = mandatory;
    plan.dynamic_weight_budget_bytes = dynamic_budget;
    plan.dense_residency_bytes = dense_bytes;
    plan.moe_residency_bytes = moe_bytes;
    plan.host_planned_bytes = host_planned;
    plan.unallocated_host_bytes = request.host_ceiling_bytes - host_planned;
    plan.device_memory_bytes = request.device_memory_requested_bytes;
    return RuntimeBudgetResult::Ok;
}

} // namespace super_runtime
