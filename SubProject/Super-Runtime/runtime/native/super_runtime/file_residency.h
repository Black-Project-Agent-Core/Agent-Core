#pragma once

#include "memory_ledger.h"

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace super_runtime {

enum class FileResidencyResult : std::uint8_t {
    Ok = 0,
    InvalidRange,
    BudgetExceeded,
    NotResident,
    InUse,
    SystemError,
};

class FileResidency;
struct FileResidencyLeaseState;

class FileResidencyLease {
public:
    FileResidencyLease() noexcept = default;
    ~FileResidencyLease() noexcept;

    FileResidencyLease(const FileResidencyLease &) = delete;
    FileResidencyLease & operator=(const FileResidencyLease &) = delete;
    FileResidencyLease(FileResidencyLease && other) noexcept;
    FileResidencyLease & operator=(FileResidencyLease && other) noexcept;

    [[nodiscard]] bool active() const noexcept;
    [[nodiscard]] const void * data() const noexcept;
    [[nodiscard]] std::uint64_t size_bytes() const noexcept;
    void reset() noexcept;

private:
    friend class FileResidency;

    std::weak_ptr<FileResidencyLeaseState> owner_state_;
    std::uint64_t offset_ = 0;
    std::uint64_t length_ = 0;
};

class FileResidency {
public:
    FileResidency(const std::string & path, MemoryLedger & ledger);
    ~FileResidency() noexcept;

    FileResidency(const FileResidency &) = delete;
    FileResidency & operator=(const FileResidency &) = delete;
    FileResidency(FileResidency &&) = delete;
    FileResidency & operator=(FileResidency &&) = delete;

    [[nodiscard]] std::uint64_t size_bytes() const noexcept;
    [[nodiscard]] std::uint64_t page_size() const noexcept;
    [[nodiscard]] std::uint64_t intentional_resident_bytes() const;

    [[nodiscard]] FileResidencyResult prefetch(std::uint64_t offset, std::uint64_t length);
    [[nodiscard]] FileResidencyResult acquire_lease(
        std::uint64_t offset,
        std::uint64_t length,
        FileResidencyLease & lease);
    [[nodiscard]] FileResidencyResult release(std::uint64_t offset, std::uint64_t length);

private:
    friend class FileResidencyLease;

    [[nodiscard]] bool valid_range(std::uint64_t offset, std::uint64_t length) const noexcept;
    [[nodiscard]] const void * lease_data(std::uint64_t offset, std::uint64_t length) const noexcept;
    void release_lease(std::uint64_t offset, std::uint64_t length) noexcept;

    MemoryLedger & ledger_;
    int fd_ = -1;
    void * mapping_ = nullptr;
    std::uint64_t size_bytes_ = 0;
    std::uint64_t page_size_ = 0;

    mutable std::mutex mutex_;
    std::vector<std::uint8_t> intentional_pages_;
    std::vector<std::uint32_t> lease_counts_;
    std::uint64_t intentional_resident_bytes_ = 0;
    std::shared_ptr<FileResidencyLeaseState> lease_state_;
};

} // namespace super_runtime
