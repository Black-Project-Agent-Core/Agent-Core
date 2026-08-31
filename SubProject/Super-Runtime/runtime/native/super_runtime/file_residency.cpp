#include "file_residency.h"

#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <system_error>

#if defined(__linux__)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#endif

namespace super_runtime {

namespace {

[[noreturn]] void throw_system_error(const char * operation) {
    throw std::system_error(errno, std::generic_category(), operation);
}

} // namespace

FileResidencyLease::FileResidencyLease(
        FileResidency * owner,
        std::uint64_t offset,
        std::uint64_t length) noexcept
    : owner_(owner), offset_(offset), length_(length) {
}

FileResidencyLease::~FileResidencyLease() noexcept {
    reset();
}

FileResidencyLease::FileResidencyLease(FileResidencyLease && other) noexcept
    : owner_(other.owner_), offset_(other.offset_), length_(other.length_) {
    other.owner_ = nullptr;
    other.offset_ = 0;
    other.length_ = 0;
}

FileResidencyLease & FileResidencyLease::operator=(FileResidencyLease && other) noexcept {
    if (this != &other) {
        reset();
        owner_ = other.owner_;
        offset_ = other.offset_;
        length_ = other.length_;
        other.owner_ = nullptr;
        other.offset_ = 0;
        other.length_ = 0;
    }
    return *this;
}

bool FileResidencyLease::active() const noexcept {
    return owner_ != nullptr;
}

void FileResidencyLease::reset() noexcept {
    if (owner_ != nullptr) {
        owner_->release_lease(offset_, length_);
        owner_ = nullptr;
        offset_ = 0;
        length_ = 0;
    }
}

FileResidency::FileResidency(const std::string & path, MemoryLedger & ledger)
    : ledger_(ledger) {
#if defined(__linux__)
    fd_ = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
    if (fd_ < 0) {
        throw_system_error("open file-backed residency source");
    }

    try {
        struct stat st {};
        if (::fstat(fd_, &st) != 0) {
            throw_system_error("fstat file-backed residency source");
        }
        if (st.st_size <= 0) {
            throw std::invalid_argument("file-backed residency source must be non-empty");
        }

        const auto file_size = static_cast<std::uint64_t>(st.st_size);
        if (file_size > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
            throw std::overflow_error("file-backed residency source exceeds addressable mapping size");
        }

        const long os_page_size = ::sysconf(_SC_PAGESIZE);
        if (os_page_size <= 0) {
            throw_system_error("sysconf(_SC_PAGESIZE)");
        }

        page_size_ = static_cast<std::uint64_t>(os_page_size);
        size_bytes_ = file_size;
        mapping_ = ::mmap(
            nullptr,
            static_cast<std::size_t>(size_bytes_),
            PROT_READ,
            MAP_PRIVATE,
            fd_,
            0);
        if (mapping_ == MAP_FAILED) {
            mapping_ = nullptr;
            throw_system_error("mmap file-backed residency source");
        }

        const auto page_count = size_bytes_ / page_size_ + ((size_bytes_ % page_size_) != 0 ? 1ULL : 0ULL);
        if (page_count > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
            throw std::overflow_error("file-backed residency page count exceeds addressable vector size");
        }
        intentional_pages_.assign(static_cast<std::size_t>(page_count), 0);
        lease_counts_.assign(static_cast<std::size_t>(page_count), 0);
    } catch (...) {
        if (mapping_ != nullptr) {
            ::munmap(mapping_, static_cast<std::size_t>(size_bytes_));
            mapping_ = nullptr;
        }
        ::close(fd_);
        fd_ = -1;
        throw;
    }
#else
    (void) path;
    throw std::runtime_error("file-backed residency backend is currently implemented for Linux only");
#endif
}

FileResidency::~FileResidency() noexcept {
#if defined(__linux__)
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (intentional_resident_bytes_ != 0) {
            const bool released = ledger_.release(MemoryCategory::ResidentWeights, intentional_resident_bytes_);
            (void) released;
            intentional_resident_bytes_ = 0;
        }
        intentional_pages_.clear();
        lease_counts_.clear();
    }

    if (mapping_ != nullptr) {
        ::munmap(mapping_, static_cast<std::size_t>(size_bytes_));
        mapping_ = nullptr;
    }
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
#endif
}

const void * FileResidency::data() const noexcept {
    return mapping_;
}

std::uint64_t FileResidency::size_bytes() const noexcept {
    return size_bytes_;
}

std::uint64_t FileResidency::page_size() const noexcept {
    return page_size_;
}

std::uint64_t FileResidency::intentional_resident_bytes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return intentional_resident_bytes_;
}

bool FileResidency::valid_range(std::uint64_t offset, std::uint64_t length) const noexcept {
    if (mapping_ == nullptr || page_size_ == 0 || length == 0) {
        return false;
    }
    if ((offset % page_size_) != 0 || (length % page_size_) != 0) {
        return false;
    }
    if (offset > size_bytes_) {
        return false;
    }
    return length <= (size_bytes_ - offset);
}

FileResidencyResult FileResidency::prefetch(std::uint64_t offset, std::uint64_t length) {
#if defined(__linux__)
    std::lock_guard<std::mutex> lock(mutex_);
    if (!valid_range(offset, length)) {
        return FileResidencyResult::InvalidRange;
    }

    const auto first_page = static_cast<std::size_t>(offset / page_size_);
    const auto page_count = static_cast<std::size_t>(length / page_size_);

    std::uint64_t newly_intentional_bytes = 0;
    for (std::size_t i = 0; i < page_count; ++i) {
        if (intentional_pages_[first_page + i] == 0) {
            newly_intentional_bytes += page_size_;
        }
    }

    if (newly_intentional_bytes == 0) {
        return FileResidencyResult::Ok;
    }

    if (!ledger_.reserve(MemoryCategory::ResidentWeights, newly_intentional_bytes)) {
        return FileResidencyResult::BudgetExceeded;
    }

    auto rollback_ledger = [&]() noexcept {
        const bool released = ledger_.release(MemoryCategory::ResidentWeights, newly_intentional_bytes);
        (void) released;
    };

    const int fadvise_result = ::posix_fadvise(
        fd_,
        static_cast<off_t>(offset),
        static_cast<off_t>(length),
        POSIX_FADV_WILLNEED);
    if (fadvise_result != 0 && fadvise_result != ENOSYS && fadvise_result != EOPNOTSUPP) {
        rollback_ledger();
        return FileResidencyResult::SystemError;
    }

    auto * const range = static_cast<std::uint8_t *>(mapping_) + offset;
    if (::madvise(range, static_cast<std::size_t>(length), MADV_WILLNEED) != 0) {
        rollback_ledger();
        return FileResidencyResult::SystemError;
    }

    volatile std::uint8_t sink = 0;
    for (std::size_t i = 0; i < page_count; ++i) {
        sink ^= range[i * static_cast<std::size_t>(page_size_)];
    }
    (void) sink;

    for (std::size_t i = 0; i < page_count; ++i) {
        intentional_pages_[first_page + i] = 1;
    }
    intentional_resident_bytes_ += newly_intentional_bytes;
    return FileResidencyResult::Ok;
#else
    (void) offset;
    (void) length;
    return FileResidencyResult::SystemError;
#endif
}

FileResidencyResult FileResidency::acquire_lease(
        std::uint64_t offset,
        std::uint64_t length,
        FileResidencyLease & lease) {
#if defined(__linux__)
    std::lock_guard<std::mutex> lock(mutex_);
    if (lease.active() || !valid_range(offset, length)) {
        return FileResidencyResult::InvalidRange;
    }

    const auto first_page = static_cast<std::size_t>(offset / page_size_);
    const auto page_count = static_cast<std::size_t>(length / page_size_);
    for (std::size_t i = 0; i < page_count; ++i) {
        const auto page = first_page + i;
        if (intentional_pages_[page] == 0) {
            return FileResidencyResult::NotResident;
        }
        if (lease_counts_[page] == std::numeric_limits<std::uint32_t>::max()) {
            return FileResidencyResult::SystemError;
        }
    }

    for (std::size_t i = 0; i < page_count; ++i) {
        lease_counts_[first_page + i] += 1;
    }
    lease.owner_ = this;
    lease.offset_ = offset;
    lease.length_ = length;
    return FileResidencyResult::Ok;
#else
    (void) offset;
    (void) length;
    (void) lease;
    return FileResidencyResult::SystemError;
#endif
}

FileResidencyResult FileResidency::release(std::uint64_t offset, std::uint64_t length) {
#if defined(__linux__)
    std::lock_guard<std::mutex> lock(mutex_);
    if (!valid_range(offset, length)) {
        return FileResidencyResult::InvalidRange;
    }

    const auto first_page = static_cast<std::size_t>(offset / page_size_);
    const auto page_count = static_cast<std::size_t>(length / page_size_);
    for (std::size_t i = 0; i < page_count; ++i) {
        if (lease_counts_[first_page + i] != 0) {
            return FileResidencyResult::InUse;
        }
    }

    auto * const range = static_cast<std::uint8_t *>(mapping_) + offset;
    if (::madvise(range, static_cast<std::size_t>(length), MADV_DONTNEED) != 0) {
        return FileResidencyResult::SystemError;
    }

    std::uint64_t released_bytes = 0;
    for (std::size_t i = 0; i < page_count; ++i) {
        if (intentional_pages_[first_page + i] != 0) {
            released_bytes += page_size_;
        }
    }

    if (released_bytes == 0) {
        return FileResidencyResult::Ok;
    }

    if (!ledger_.release(MemoryCategory::ResidentWeights, released_bytes)) {
        return FileResidencyResult::SystemError;
    }

    for (std::size_t i = 0; i < page_count; ++i) {
        intentional_pages_[first_page + i] = 0;
    }
    intentional_resident_bytes_ -= released_bytes;
    return FileResidencyResult::Ok;
#else
    (void) offset;
    (void) length;
    return FileResidencyResult::SystemError;
#endif
}

void FileResidency::release_lease(std::uint64_t offset, std::uint64_t length) noexcept {
#if defined(__linux__)
    std::lock_guard<std::mutex> lock(mutex_);
    if (!valid_range(offset, length)) {
        return;
    }

    const auto first_page = static_cast<std::size_t>(offset / page_size_);
    const auto page_count = static_cast<std::size_t>(length / page_size_);
    for (std::size_t i = 0; i < page_count; ++i) {
        auto & count = lease_counts_[first_page + i];
        if (count != 0) {
            count -= 1;
        }
    }
#else
    (void) offset;
    (void) length;
#endif
}

} // namespace super_runtime
