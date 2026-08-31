#include "super_runtime/memory_ledger.h"

#include <limits>

namespace super_runtime {

MemoryLedger::MemoryLedger(std::uint64_t budget_bytes) noexcept
    : budget_bytes_(budget_bytes) {
}

std::uint64_t MemoryLedger::budget_bytes() const noexcept {
    return budget_bytes_;
}

std::uint64_t MemoryLedger::owned_bytes() const {
    const std::lock_guard<std::mutex> lock(mutex_);
    return owned_bytes_;
}

std::uint64_t MemoryLedger::category_bytes(MemoryCategory category) const {
    if (!valid_category(category)) {
        return 0;
    }

    const std::lock_guard<std::mutex> lock(mutex_);
    return category_bytes_[category_index(category)];
}

bool MemoryLedger::reserve(MemoryCategory category, std::uint64_t bytes) {
    if (!valid_category(category)) {
        return false;
    }

    const std::lock_guard<std::mutex> lock(mutex_);
    const auto index = category_index(category);

    if (bytes > budget_bytes_ - owned_bytes_) {
        return false;
    }
    if (bytes > std::numeric_limits<std::uint64_t>::max() - category_bytes_[index]) {
        return false;
    }

    owned_bytes_ += bytes;
    category_bytes_[index] += bytes;
    return true;
}

bool MemoryLedger::release(MemoryCategory category, std::uint64_t bytes) {
    if (!valid_category(category)) {
        return false;
    }

    const std::lock_guard<std::mutex> lock(mutex_);
    const auto index = category_index(category);
    if (bytes > category_bytes_[index] || bytes > owned_bytes_) {
        return false;
    }

    category_bytes_[index] -= bytes;
    owned_bytes_ -= bytes;
    return true;
}

bool MemoryLedger::valid_category(MemoryCategory category) noexcept {
    return category_index(category) < category_count;
}

std::size_t MemoryLedger::category_index(MemoryCategory category) noexcept {
    return static_cast<std::size_t>(category);
}

} // namespace super_runtime
