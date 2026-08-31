#pragma once

#include "file_residency.h"

#include <cstdint>
#include <vector>

namespace super_runtime {

struct DenseLayerRange {
    std::uint64_t offset = 0;
    std::uint64_t length = 0;
};

enum class DensePlanResult : std::uint8_t {
    Ok = 0,
    InvalidArgument,
    BudgetTooSmall,
    Overflow,
};

struct DenseResidencyPlan {
    std::vector<DenseLayerRange> layers;
    std::uint64_t residency_alignment = 0;
    std::uint64_t configured_budget_bytes = 0;
    std::uint64_t pinned_prefix_count = 0;
    std::uint64_t ring_slots = 0;
    std::uint64_t pinned_bytes = 0;
    std::uint64_t max_dynamic_layer_bytes = 0;
    std::uint64_t required_budget_bytes = 0;

    [[nodiscard]] double pinned_hit_ratio() const noexcept;
};

[[nodiscard]] DensePlanResult plan_dense_residency(
    const std::vector<DenseLayerRange> & layers,
    std::uint64_t residency_alignment,
    std::uint64_t budget_bytes,
    DenseResidencyPlan & plan);

enum class DenseResidencyResult : std::uint8_t {
    Ok = 0,
    NotStarted,
    InvalidLayer,
    OutOfOrder,
    Busy,
    ResidencyError,
};

class DenseResidencyPolicy {
public:
    DenseResidencyPolicy(FileResidency & residency, DenseResidencyPlan plan);

    DenseResidencyPolicy(const DenseResidencyPolicy &) = delete;
    DenseResidencyPolicy & operator=(const DenseResidencyPolicy &) = delete;
    DenseResidencyPolicy(DenseResidencyPolicy &&) = delete;
    DenseResidencyPolicy & operator=(DenseResidencyPolicy &&) = delete;

    [[nodiscard]] DenseResidencyResult start();
    [[nodiscard]] DenseResidencyResult prepare(std::uint64_t layer_index);
    [[nodiscard]] DenseResidencyResult complete(std::uint64_t layer_index);
    [[nodiscard]] DenseResidencyResult stop();

    [[nodiscard]] const DenseResidencyPlan & plan() const noexcept;
    [[nodiscard]] bool is_intentionally_resident(std::uint64_t layer_index) const noexcept;

private:
    static constexpr std::uint64_t no_active_layer = ~std::uint64_t{0};

    [[nodiscard]] DenseResidencyResult ensure_resident(std::uint64_t layer_index);
    [[nodiscard]] DenseResidencyResult release_layer(std::uint64_t layer_index);

    FileResidency & residency_;
    DenseResidencyPlan plan_;
    std::vector<std::uint8_t> resident_;
    FileResidencyLease active_lease_;
    bool started_ = false;
    std::uint64_t expected_layer_ = 0;
    std::uint64_t active_layer_ = no_active_layer;
};

} // namespace super_runtime
