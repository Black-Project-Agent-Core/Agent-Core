#pragma once

#include "memory_ledger.h"

#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

namespace super_runtime {

enum class FileResidencyResult : std::uint8_t {
    Ok = 0,
    InvalidRange,
    BudgetExceeded,
    SystemError,
};

class FileResidency {
public:
    FileResidency(const std::string & path, MemoryLedger & ledger);
    ~FileResidency() noexcept;

    FileResidency(const FileResidency &) = delete;
    FileResidency & operator=(const FileResidency &) = delete;
    FileResidency(FileResidency &&) = delete;
    FileResidency & operator=(FileResidency &&) = delete;

    [[nodiscard]] const void * data() const noexcept;
    [[nodiscard]] std::uint64_t size_bytes() const noexcept;
    [[nodiscard]] std::uint64_t page_size() const noexcept;
    [[nodiscard]] std::uint64_t intentional_resident_bytes() const;

    [[nodiscard]] FileResidencyResult prefetch(std::uint64_t offset, std::uint64_t length);
    [[nodiscard]] FileResidencyResult release(std::uint64_t offset, std::uint64_t length);

private:
    [[nodiscard]] bool valid_range(std::uint64_t offset, std::uint64_t length) const noexcept;

    MemoryLedger & ledger_;
    int fd_ = -1;
    void * mapping_ = nullptr;
    std::uint64_t size_bytes_ = 0;
    std::uint64_t page_size_ = 0;

    mutable std::mutex mutex_;
    std::vector<std::uint8_t> intentional_pages_;
    std::uint64_t intentional_resident_bytes_ = 0;
};

} // namespace super_runtime
