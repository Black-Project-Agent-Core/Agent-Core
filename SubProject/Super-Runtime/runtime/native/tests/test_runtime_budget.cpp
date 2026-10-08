#include "super_runtime/runtime_budget.h"

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <string>

namespace {

using super_runtime::RuntimeBudgetPlan;
using super_runtime::RuntimeBudgetRequest;
using super_runtime::RuntimeBudgetResult;
using super_runtime::plan_runtime_budget;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "runtime-budget test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

RuntimeBudgetRequest baseline_request() {
    RuntimeBudgetRequest request{};
    request.host_ceiling_bytes = 1000;
    request.runtime_overhead_bytes = 100;
    request.mandatory_weights_bytes = 100;
    request.context_state_bytes = 200;
    request.compute_scratch_bytes = 100;
    request.staging_bytes = 50;
    request.safety_reserve_bytes = 50;
    request.dense_min_bytes = 100;
    request.dense_preferred_bytes = 250;
    request.moe_min_bytes = 50;
    request.moe_preferred_bytes = 250;
    request.dense_share_percent = 60;
    request.device_memory_available_bytes = 0;
    request.device_memory_requested_bytes = 0;
    return request;
}

} // namespace

int main() {
    {
        const auto request = baseline_request();
        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::Ok,
                "baseline request must be feasible");
        require(plan.host_ceiling_bytes == 1000, "plan must preserve host ceiling");
        require(plan.mandatory_host_bytes == 600, "mandatory host cost must be reserved first");
        require(plan.dynamic_weight_budget_bytes == 400, "remaining host ceiling must become dynamic weight budget");
        require(plan.dense_residency_bytes == 250, "60-percent policy should satisfy dense preferred target first");
        require(plan.moe_residency_bytes == 150, "remaining dynamic bytes should go to MoE after dense target");
        require(plan.host_planned_bytes == 1000, "host plan must reconcile exactly to the ceiling when demand consumes it");
        require(plan.unallocated_host_bytes == 0, "fully consumed host plan must have no unallocated bytes");
        require(plan.device_memory_bytes == 0, "CPU-only baseline must plan no device memory");
    }

    {
        auto request = baseline_request();
        request.host_ceiling_bytes = 520;
        request.context_state_bytes = 300;
        request.dense_min_bytes = 0;
        request.dense_preferred_bytes = 0;
        request.moe_min_bytes = 0;
        request.moe_preferred_bytes = 0;

        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::HostBudgetExceeded,
                "context state must make a request infeasible even when dynamic weights are zero");
        require(plan.host_planned_bytes == 0, "failed admission must not publish a partial host plan");
    }

    {
        auto request = baseline_request();
        request.host_ceiling_bytes = 700;
        request.dense_min_bytes = 80;
        request.dense_preferred_bytes = 200;
        request.moe_min_bytes = 40;
        request.moe_preferred_bytes = 200;

        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::HostBudgetExceeded,
                "mandatory dynamic minima must be admitted before discretionary preference");
        require(plan.host_planned_bytes == 0, "failed minimum admission must not publish a partial plan");
    }

    {
        auto request = baseline_request();
        request.host_ceiling_bytes = 900;
        request.dense_min_bytes = 100;
        request.dense_preferred_bytes = 400;
        request.moe_min_bytes = 100;
        request.moe_preferred_bytes = 400;
        request.dense_share_percent = 25;

        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::Ok,
                "constrained weighted request must be feasible");
        require(plan.dynamic_weight_budget_bytes == 300, "dynamic budget must be the exact post-mandatory remainder");
        require(plan.dense_residency_bytes == 125, "25-percent discretionary share must be inspectable in dense allocation");
        require(plan.moe_residency_bytes == 175, "75-percent discretionary share must be inspectable in MoE allocation");
        require(plan.dense_residency_bytes + plan.moe_residency_bytes <= plan.dynamic_weight_budget_bytes,
                "dynamic allocations must never exceed the dynamic budget");
    }

    {
        auto request = baseline_request();
        request.device_memory_available_bytes = 1024;
        request.device_memory_requested_bytes = 512;
        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::Ok,
                "available optional device memory must be represented independently");
        require(plan.device_memory_bytes == 512, "device plan must preserve admitted device request");

        request.device_memory_requested_bytes = 2048;
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::DeviceBudgetExceeded,
                "device request above inventory must fail closed");
        require(plan.host_planned_bytes == 0 && plan.device_memory_bytes == 0,
                "device failure must not publish a partial plan");
    }

    {
        auto request = baseline_request();
        request.dense_share_percent = 101;
        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::InvalidArgument,
                "share above 100 percent must be rejected");
    }

    {
        RuntimeBudgetRequest request{};
        request.host_ceiling_bytes = std::numeric_limits<std::uint64_t>::max();
        request.runtime_overhead_bytes = std::numeric_limits<std::uint64_t>::max();
        request.mandatory_weights_bytes = 1;
        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::Overflow,
                "mandatory-cost arithmetic overflow must fail closed");
        require(plan.host_planned_bytes == 0, "overflow must not publish a partial plan");
    }

    {
        auto request = baseline_request();
        request.host_ceiling_bytes = 1400;
        RuntimeBudgetPlan plan{};
        require(plan_runtime_budget(request, plan) == RuntimeBudgetResult::Ok,
                "larger ceiling must remain feasible");
        require(plan.dense_residency_bytes == 250 && plan.moe_residency_bytes == 250,
                "preferred dynamic targets should be capped at requested preferences");
        require(plan.host_planned_bytes == 1100, "host plan must stop at actual requested demand");
        require(plan.unallocated_host_bytes == 300, "unused ceiling must stay explicit instead of being fabricated as ownership");
    }

    std::cout << "runtime-budget tests: PASS\n";
    return 0;
}
