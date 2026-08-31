#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

namespace super_runtime {

enum class MemoryCategory : std::uint8_t {
    ResidentWeights = 0,
    ContextState,
    ComputeScratch,
    Staging,
    AcceleratorMemory,
    RuntimeOverhead,
    Count,
};

class MemoryLedger {
public:
    explicit MemoryLedger(std::uint64_t budget_bytes) noexcept;

    [[nodiscard]] std::uint64_t budget_bytes() const noexcept;
    [[nodiscard]] std::uint64_t owned_bytes() const;
    [[nodiscard]] std::uint64_t category_bytes(MemoryCategory category) const;

    [[nodiscard]] bool reserve(MemoryCategory category, std::uint64_t bytes);
    [[nodiscard]] bool release(MemoryCategory category, std::uint64_t bytes);

private:
    static constexpr std::size_t category_count = static_cast<std::size_t>(MemoryCategory::Count);

    [[nodiscard]] static bool valid_category(MemoryCategory category) noexcept;
    [[nodiscard]] static std::size_t category_index(MemoryCategory category) noexcept;

    const std::uint64_t budget_bytes_;
    mutable std::mutex mutex_;
    std::uint64_t owned_bytes_ = 0;
    std::array<std::uint64_t, category_count> category_bytes_{};
};

} // namespace super_runtime
