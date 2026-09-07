#include "dense_residency.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <utility>
#include <vector>

namespace super_runtime {
namespace {

bool add_overflow(std::uint64_t a, std::uint64_t b, std::uint64_t & out) noexcept {
    if (b > std::numeric_limits<std::uint64_t>::max() - a) {
        return true;
    }
    out = a + b;
    return false;
}

bool mul_overflow(std::uint64_t a, std::uint64_t b, std::uint64_t & out) noexcept {
    if (a != 0 && b > std::numeric_limits<std::uint64_t>::max() / a) {
        return true;
    }
    out = a * b;
    return false;
}

DenseResidencyResult to_dense_result(FileResidencyResult result) noexcept {
    return result == FileResidencyResult::Ok ? DenseResidencyResult::Ok : DenseResidencyResult::ResidencyError;
}

} // namespace

double DenseResidencyPlan::pinned_hit_ratio() const noexcept {
    if (layers.empty()) {
        return 0.0;
    }
    return static_cast<double>(pinned_prefix_count) / static_cast<double>(layers.size());
}

DensePlanResult plan_dense_residency(
        const std::vector<DenseLayerRange> & layers,
        std::uint64_t residency_alignment,
        std::uint64_t budget_bytes,
        DenseResidencyPlan & plan,
        DenseTraversal traversal) {
    plan = DenseResidencyPlan{};

    if (layers.empty() || residency_alignment == 0 || budget_bytes == 0 ||
        (traversal != DenseTraversal::Cyclic && traversal != DenseTraversal::Finite)) {

        return DensePlanResult::InvalidArgument;
    }

    std::vector<std::uint64_t> prefix(layers.size() + 1, 0);
    std::vector<std::uint64_t> suffix_max(layers.size(), 0);

    std::uint64_t previous_end = 0;
    for (std::size_t i = 0; i < layers.size(); ++i) {
        const auto & layer = layers[i];
        if (layer.length == 0 || layer.offset % residency_alignment != 0 ||
            layer.length % residency_alignment != 0) {
            return DensePlanResult::InvalidArgument;
        }

        std::uint64_t end = 0;
        if (add_overflow(layer.offset, layer.length, end)) {
            return DensePlanResult::Overflow;
        }
        if (i != 0 && layer.offset < previous_end) {
            return DensePlanResult::InvalidArgument;
        }
        previous_end = end;

        if (add_overflow(prefix[i], layer.length, prefix[i + 1])) {
            return DensePlanResult::Overflow;
        }
    }

    for (std::size_t i = layers.size(); i-- > 0;) {
        suffix_max[i] = layers[i].length;
        if (i + 1 < layers.size()) {
            suffix_max[i] = std::max(suffix_max[i], suffix_max[i + 1]);
        }
    }

    const auto publish = [&](std::uint64_t pinned_prefix_count,
                             std::uint64_t ring_slots,
                             std::uint64_t max_dynamic_layer_bytes,
                             std::uint64_t required_budget_bytes) {
        plan.layers = layers;
        plan.residency_alignment = residency_alignment;
        plan.configured_budget_bytes = budget_bytes;
        plan.pinned_prefix_count = pinned_prefix_count;
        plan.ring_slots = ring_slots;
        plan.pinned_bytes = prefix[static_cast<std::size_t>(pinned_prefix_count)];
        plan.max_dynamic_layer_bytes = max_dynamic_layer_bytes;
        plan.required_budget_bytes = required_budget_bytes;
        plan.traversal = traversal;
    };

    const std::uint64_t total_bytes = prefix.back();
    if (total_bytes <= budget_bytes) {
        publish(static_cast<std::uint64_t>(layers.size()), 0, 0, total_bytes);
        return DensePlanResult::Ok;
    }

    if (layers.size() >= 2) {
        for (std::size_t pinned = layers.size() - 1; pinned-- > 0;) {
            if (layers.size() - pinned < 2) {
                continue;
            }

            std::uint64_t ring_bytes = 0;
            if (mul_overflow(2, suffix_max[pinned], ring_bytes)) {
                return DensePlanResult::Overflow;
            }
            std::uint64_t required = 0;
            if (add_overflow(prefix[pinned], ring_bytes, required)) {
                return DensePlanResult::Overflow;
            }
            if (required <= budget_bytes) {
                publish(static_cast<std::uint64_t>(pinned), 2, suffix_max[pinned], required);
                return DensePlanResult::Ok;
            }
        }
    }

    for (std::size_t pinned = layers.size(); pinned-- > 0;) {
        std::uint64_t required = 0;
        if (add_overflow(prefix[pinned], suffix_max[pinned], required)) {
            return DensePlanResult::Overflow;
        }
        if (required <= budget_bytes) {
            publish(static_cast<std::uint64_t>(pinned), 1, suffix_max[pinned], required);
            return DensePlanResult::Ok;
        }
    }

    return DensePlanResult::BudgetTooSmall;
}

DenseResidencyPolicy::DenseResidencyPolicy(FileResidency & residency, DenseResidencyPlan plan)
    : residency_(residency), plan_(std::move(plan)), resident_(plan_.layers.size(), 0) {
}

DenseResidencyResult DenseResidencyPolicy::start() {
    if (started_) {
        return DenseResidencyResult::Ok;
    }
    if (plan_.layers.empty() || plan_.pinned_prefix_count > plan_.layers.size()) {
        return DenseResidencyResult::ResidencyError;
    }

    std::vector<std::uint64_t> loaded;
    loaded.reserve(static_cast<std::size_t>(plan_.pinned_prefix_count));
    for (std::uint64_t layer = 0; layer < plan_.pinned_prefix_count; ++layer) {
        const auto result = ensure_resident(layer);
        if (result != DenseResidencyResult::Ok) {
            for (auto it = loaded.rbegin(); it != loaded.rend(); ++it) {
                (void)release_layer(*it);
            }
            return result;
        }
        loaded.push_back(layer);
    }

    started_ = true;
    expected_layer_ = 0;
    active_layer_ = no_active_layer;
    return DenseResidencyResult::Ok;
}

DenseResidencyResult DenseResidencyPolicy::prepare(std::uint64_t layer_index) {
    if (!started_) {
        return DenseResidencyResult::NotStarted;
    }
    if (layer_index >= plan_.layers.size()) {
        return DenseResidencyResult::InvalidLayer;
    }
    if (active_layer_ != no_active_layer) {
        return DenseResidencyResult::Busy;
    }
    if (layer_index != expected_layer_) {
        return DenseResidencyResult::OutOfOrder;
    }

    std::vector<std::uint64_t> loaded_now;
    loaded_now.reserve(2);

    if (!resident_[static_cast<std::size_t>(layer_index)]) {
        const auto result = ensure_resident(layer_index);
        if (result != DenseResidencyResult::Ok) {
            return result;
        }
        loaded_now.push_back(layer_index);
    }

    const auto & current = plan_.layers[static_cast<std::size_t>(layer_index)];
    if (residency_.acquire_lease(current.offset, current.length, active_lease_) != FileResidencyResult::Ok) {
        for (auto it = loaded_now.rbegin(); it != loaded_now.rend(); ++it) {
            (void)release_layer(*it);
        }
        return DenseResidencyResult::ResidencyError;
    }

    const bool has_next = layer_index + 1 < static_cast<std::uint64_t>(plan_.layers.size());
    const bool may_wrap = plan_.traversal == DenseTraversal::Cyclic;
    if (plan_.ring_slots == 2 && plan_.layers.size() > 1 && (has_next || may_wrap)) {
        const std::uint64_t next = has_next ? layer_index + 1 : 0;
        if (next >= plan_.pinned_prefix_count && next != layer_index &&
            !resident_[static_cast<std::size_t>(next)]) {

            const auto result = ensure_resident(next);
            if (result != DenseResidencyResult::Ok) {
                active_lease_.reset();
                for (auto it = loaded_now.rbegin(); it != loaded_now.rend(); ++it) {
                    (void)release_layer(*it);
                }
                return result;
            }
            loaded_now.push_back(next);
        }
    }

    active_layer_ = layer_index;
    return DenseResidencyResult::Ok;
}

DenseResidencyResult DenseResidencyPolicy::complete(std::uint64_t layer_index) {
    if (!started_) {
        return DenseResidencyResult::NotStarted;
    }
    if (layer_index >= plan_.layers.size()) {
        return DenseResidencyResult::InvalidLayer;
    }
    if (active_layer_ == no_active_layer) {
        return DenseResidencyResult::OutOfOrder;
    }
    if (active_layer_ != layer_index) {
        return DenseResidencyResult::OutOfOrder;
    }

    active_lease_.reset();
    active_layer_ = no_active_layer;
    if (plan_.traversal == DenseTraversal::Cyclic) {
        expected_layer_ = (layer_index + 1) % static_cast<std::uint64_t>(plan_.layers.size());
    } else {
        expected_layer_ = layer_index + 1;
    }

    if (layer_index >= plan_.pinned_prefix_count) {
        const auto result = release_layer(layer_index);
        if (result != DenseResidencyResult::Ok) {
            return result;
        }
    }

    return DenseResidencyResult::Ok;

}

DenseResidencyResult DenseResidencyPolicy::stop() {
    if (!started_) {
        return DenseResidencyResult::Ok;
    }
    if (active_layer_ != no_active_layer) {
        return DenseResidencyResult::Busy;
    }

    active_lease_.reset();

    DenseResidencyResult overall = DenseResidencyResult::Ok;
    for (std::uint64_t layer = 0; layer < plan_.layers.size(); ++layer) {
        if (resident_[static_cast<std::size_t>(layer)]) {
            const auto result = release_layer(layer);
            if (result != DenseResidencyResult::Ok) {
                overall = result;
            }
        }
    }

    if (overall == DenseResidencyResult::Ok) {
        started_ = false;
        expected_layer_ = 0;
        active_layer_ = no_active_layer;
    }
    return overall;
}

const DenseResidencyPlan & DenseResidencyPolicy::plan() const noexcept {
    return plan_;
}

bool DenseResidencyPolicy::is_intentionally_resident(std::uint64_t layer_index) const noexcept {
    return layer_index < resident_.size() && resident_[static_cast<std::size_t>(layer_index)] != 0;
}

const void * DenseResidencyPolicy::active_data() const noexcept {
    return active_layer_ == no_active_layer ? nullptr : active_lease_.data();
}


DenseResidencyResult DenseResidencyPolicy::ensure_resident(std::uint64_t layer_index) {
    if (layer_index >= plan_.layers.size()) {
        return DenseResidencyResult::InvalidLayer;
    }
    if (resident_[static_cast<std::size_t>(layer_index)]) {
        return DenseResidencyResult::Ok;
    }

    const auto & layer = plan_.layers[static_cast<std::size_t>(layer_index)];
    const auto result = to_dense_result(residency_.prefetch(layer.offset, layer.length));
    if (result == DenseResidencyResult::Ok) {
        resident_[static_cast<std::size_t>(layer_index)] = 1;
    }
    return result;
}

DenseResidencyResult DenseResidencyPolicy::release_layer(std::uint64_t layer_index) {
    if (layer_index >= plan_.layers.size()) {
        return DenseResidencyResult::InvalidLayer;
    }
    if (!resident_[static_cast<std::size_t>(layer_index)]) {
        return DenseResidencyResult::Ok;
    }

    const auto & layer = plan_.layers[static_cast<std::size_t>(layer_index)];
    const auto result = to_dense_result(residency_.release(layer.offset, layer.length));
    if (result == DenseResidencyResult::Ok) {
        resident_[static_cast<std::size_t>(layer_index)] = 0;
    }
    return result;
}

} // namespace super_runtime
