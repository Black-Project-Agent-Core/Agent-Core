#pragma once

#include "runtime_budget.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace super_runtime {

enum class RuntimeLifecycle : std::uint8_t {
    Empty = 0,
    Loaded,
    Admitted,
    Running,
    Completed,
    Cancelled,
    Failed,
    Unloaded,
};

enum class RuntimeEntryResult : std::uint8_t {
    Ok = 0,
    InvalidState,
    InvalidArgument,
    LoadFailed,
    BudgetRejected,
    ResidencyError,
    ComputeError,
    Cancelled,
};

struct RuntimeFixtureSpec {
    std::string weights_path;
    std::uint64_t layer_count = 0;
    std::uint64_t width = 0;
};

struct RuntimeTelemetry {
    RuntimeLifecycle state = RuntimeLifecycle::Empty;
    std::uint64_t mapped_weight_bytes = 0;
    std::uint64_t host_ceiling_bytes = 0;
    std::uint64_t planned_host_bytes = 0;
    std::uint64_t ggml_metadata_required_bytes = 0;
    std::uint64_t ggml_compute_required_bytes = 0;
    std::uint64_t peak_owned_bytes = 0;
    std::uint64_t current_owned_bytes = 0;
    std::uint64_t intentional_resident_bytes = 0;
    std::uint64_t completed_layers = 0;
    std::uint64_t dense_pinned_prefix_count = 0;
    std::uint64_t dense_ring_slots = 0;
    std::uint64_t ready_before_compute_count = 0;
    std::vector<float> output;
};

using RuntimeCancellationCheck = std::function<bool()>;

class RuntimeEntry {
public:
    RuntimeEntry();
    ~RuntimeEntry() noexcept;

    RuntimeEntry(const RuntimeEntry &) = delete;
    RuntimeEntry & operator=(const RuntimeEntry &) = delete;
    RuntimeEntry(RuntimeEntry &&) noexcept;
    RuntimeEntry & operator=(RuntimeEntry &&) noexcept;

    [[nodiscard]] RuntimeEntryResult load(const RuntimeFixtureSpec & fixture);
    [[nodiscard]] RuntimeEntryResult admit(const RuntimeBudgetRequest & request);
    [[nodiscard]] RuntimeEntryResult execute(
        const std::vector<float> & input,
        const RuntimeCancellationCheck & cancellation_check = {});
    [[nodiscard]] RuntimeEntryResult unload() noexcept;

    [[nodiscard]] const RuntimeTelemetry & telemetry() const noexcept;

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace super_runtime
