#include "super_runtime/file_residency.h"
#include "super_runtime/memory_ledger.h"

#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

namespace {

using super_runtime::FileResidency;
using super_runtime::FileResidencyLease;
using super_runtime::FileResidencyResult;
using super_runtime::MemoryCategory;
using super_runtime::MemoryLedger;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "file-residency test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

class TempFile {
public:
    TempFile(std::uint64_t size_bytes, std::uint64_t page_size) {
        char path_template[] = "/tmp/super-runtime-file-residency-XXXXXX";
        const int fd = ::mkstemp(path_template);
        if (fd < 0) {
            throw std::runtime_error(std::string("mkstemp failed: ") + std::strerror(errno));
        }

        path_ = path_template;
        try {
            constexpr std::size_t chunk_size = 1U << 20;
            std::vector<std::uint8_t> chunk(chunk_size);
            std::uint64_t written = 0;
            while (written < size_bytes) {
                const auto remaining = size_bytes - written;
                const auto bytes = static_cast<std::size_t>(remaining < chunk.size() ? remaining : chunk.size());
                for (std::size_t i = 0; i < bytes; ++i) {
                    chunk[i] = expected_byte(written + i);
                }
                std::size_t offset = 0;
                while (offset < bytes) {
                    const auto rc = ::write(fd, chunk.data() + offset, bytes - offset);
                    if (rc < 0) {
                        if (errno == EINTR) {
                            continue;
                        }
                        throw std::runtime_error(std::string("write failed: ") + std::strerror(errno));
                    }
                    offset += static_cast<std::size_t>(rc);
                }
                written += bytes;
            }
            if (::fsync(fd) != 0) {
                throw std::runtime_error(std::string("fsync failed: ") + std::strerror(errno));
            }
            if (size_bytes == 0 || size_bytes % page_size != 0) {
                throw std::runtime_error("test fixture must be non-zero and page aligned");
            }
        } catch (...) {
            ::close(fd);
            ::unlink(path_.c_str());
            throw;
        }

        ::close(fd);
    }

    ~TempFile() {
        if (!path_.empty()) {
            ::unlink(path_.c_str());
        }
    }

    TempFile(const TempFile &) = delete;
    TempFile & operator=(const TempFile &) = delete;

    [[nodiscard]] const std::string & path() const noexcept {
        return path_;
    }

    static std::uint8_t expected_byte(std::uint64_t offset) noexcept {
        return static_cast<std::uint8_t>((offset * 131ULL + 17ULL) & 0xffULL);
    }

private:
    std::string path_;
};

std::uint64_t vm_rss_kib() {
    std::ifstream status("/proc/self/status");
    std::string key;
    while (status >> key) {
        if (key == "VmRSS:") {
            std::uint64_t kib = 0;
            std::string unit;
            status >> kib >> unit;
            return kib;
        }
        status.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    }
    return 0;
}

void require_byte(const FileResidency & mapping, std::uint64_t offset) {
    const auto * bytes = static_cast<const std::uint8_t *>(mapping.data());
    require(bytes != nullptr, "mapped data pointer must not be null");
    require(bytes[offset] == TempFile::expected_byte(offset), "mapped byte differs from deterministic fixture");
}

} // namespace

int main() {
    const long system_page_size = ::sysconf(_SC_PAGESIZE);
    require(system_page_size > 0, "sysconf(_SC_PAGESIZE) must succeed");
    const auto page_size = static_cast<std::uint64_t>(system_page_size);

    constexpr std::uint64_t fixture_mib = 16;
    const std::uint64_t file_size = fixture_mib * 1024ULL * 1024ULL;
    require(file_size % page_size == 0, "fixture size must be page aligned");
    TempFile fixture(file_size, page_size);

    {
        MemoryLedger ledger(page_size * 8);
        FileResidency mapping(fixture.path(), ledger);
        const void * const base = mapping.data();

        require(mapping.size_bytes() == file_size, "mapping must expose the complete file size");
        require(mapping.page_size() == page_size, "mapping must expose the operating-system page size");
        require(base != nullptr, "mapping base address must exist");
        require(ledger.owned_bytes() == 0, "virtual mapping alone must not consume resident-weight ledger bytes");
        require(mapping.intentional_resident_bytes() == 0, "mapping must begin with no intentional residency");

        require(mapping.prefetch(1, page_size) == FileResidencyResult::InvalidRange,
                "misaligned offset must be rejected");
        require(mapping.prefetch(0, page_size - 1) == FileResidencyResult::InvalidRange,
                "misaligned length must be rejected");
        require(mapping.prefetch(0, 0) == FileResidencyResult::InvalidRange,
                "zero-length range must be rejected");
        require(mapping.prefetch(file_size, page_size) == FileResidencyResult::InvalidRange,
                "out-of-bounds range must be rejected");
        require(ledger.owned_bytes() == 0, "invalid requests must not mutate the ledger");

        const std::uint64_t offset = page_size * 2;
        const std::uint64_t length = page_size * 4;
        const auto rss_before = vm_rss_kib();
        require(mapping.prefetch(offset, length) == FileResidencyResult::Ok,
                "valid aligned prefetch must succeed");
        const auto rss_after_prefetch = vm_rss_kib();

        require(mapping.data() == base, "prefetch must not change the mapped base address");
        require(mapping.intentional_resident_bytes() == length, "prefetch must account intentional resident bytes");
        require(ledger.owned_bytes() == length, "prefetch must reserve ledger bytes");
        require(ledger.category_bytes(MemoryCategory::ResidentWeights) == length,
                "prefetch must charge ResidentWeights");
        require_byte(mapping, offset);
        require_byte(mapping, offset + length - 1);

        require(mapping.prefetch(offset, length) == FileResidencyResult::Ok,
                "repeated prefetch of the same pages must be idempotent");
        require(ledger.owned_bytes() == length, "idempotent prefetch must not double-charge the ledger");

        require(mapping.release(offset, length) == FileResidencyResult::Ok,
                "valid aligned release must succeed");
        const auto rss_after_release = vm_rss_kib();
        require(mapping.data() == base, "release must not unmap or change the base address");
        require(mapping.intentional_resident_bytes() == 0, "release must clear intentional residency");
        require(ledger.owned_bytes() == 0, "release must return ledger bytes");

        require_byte(mapping, offset);
        require(mapping.data() == base, "demand refault must preserve the same virtual address");
        require(ledger.owned_bytes() == 0,
                "demand refault is a correctness fallback and must not masquerade as intentional residency");

        require(mapping.release(offset, length) == FileResidencyResult::Ok,
                "repeated release must be idempotent");

        std::cout << "rss evidence KiB: before=" << rss_before
                  << " after_prefetch=" << rss_after_prefetch
                  << " after_release=" << rss_after_release << '\n';
    }

    {
        MemoryLedger ledger(page_size * 2);
        FileResidency mapping(fixture.path(), ledger);
        require(mapping.prefetch(0, page_size * 3) == FileResidencyResult::BudgetExceeded,
                "prefetch larger than the ledger budget must be refused");
        require(ledger.owned_bytes() == 0, "budget refusal must be atomic");
        require(mapping.intentional_resident_bytes() == 0, "budget refusal must not publish residency");
    }

    {
        MemoryLedger ledger(page_size * 4);
        {
            FileResidency mapping(fixture.path(), ledger);
            require(mapping.prefetch(0, page_size * 2) == FileResidencyResult::Ok,
                    "destructor fixture prefetch must succeed");
            require(ledger.owned_bytes() == page_size * 2, "destructor fixture must own bytes before teardown");
        }
        require(ledger.owned_bytes() == 0, "FileResidency destructor must release ledger ownership");
    }

    {
        MemoryLedger ledger(page_size * 2);
        FileResidency mapping(fixture.path(), ledger);
        require(mapping.prefetch(0, page_size * 2) == FileResidencyResult::Ok,
                "lease fixture must prefetch two pages");

        FileResidencyLease lease;
        require(mapping.acquire_lease(0, page_size, lease) == FileResidencyResult::Ok,
                "READY page must be leasable");
        require(lease.active(), "acquired lease must report active");

        FileResidencyLease overlapping;
        require(mapping.acquire_lease(0, page_size, overlapping) == FileResidencyResult::Ok,
                "the same READY page must support overlapping lease ownership");
        require(mapping.release(0, page_size * 2) == FileResidencyResult::InUse,
                "a wider release containing any leased page must fail atomically");
        require(ledger.owned_bytes() == page_size * 2,
                "failed overlapping-range reclaim must not change ownership");

        FileResidencyLease moved = std::move(overlapping);
        require(!overlapping.active() && moved.active(),
                "moving a lease must transfer the only active token ownership");
        lease.reset();
        require(mapping.release(0, page_size) == FileResidencyResult::InUse,
                "reclaim must remain blocked until the final overlapping lease is released");
        require(ledger.owned_bytes() == page_size * 2,
                "failed leased-page reclaim must not change ownership");

        moved.reset();

        require(mapping.release(page_size, page_size) == FileResidencyResult::Ok,
                "unleased neighboring page must remain independently reclaimable");
        require(ledger.owned_bytes() == page_size,
                "unleased neighboring release must update ownership normally");

        FileResidencyLease nonresident;
        require(mapping.acquire_lease(page_size, page_size, nonresident) == FileResidencyResult::NotResident,
                "nonresident page must not publish a lease");
        require(!nonresident.active(), "failed nonresident lease must remain inactive");

        lease.reset();
        require(!lease.active(), "reset lease must become inactive");
        require(mapping.release(0, page_size) == FileResidencyResult::Ok,
                "page must become reclaimable after lease release");
        require(ledger.owned_bytes() == 0,
                "lease fixture must release all ownership");
    }

    {
        MemoryLedger ledger(file_size);
        FileResidency mapping(fixture.path(), ledger);
        const auto rss_before = vm_rss_kib();
        require(mapping.prefetch(0, file_size) == FileResidencyResult::Ok,
                "full bounded RSS-evidence prefetch must succeed");
        const auto rss_after_prefetch = vm_rss_kib();
        require(ledger.owned_bytes() == file_size, "full prefetch must be represented in the ledger");
        require(mapping.release(0, file_size) == FileResidencyResult::Ok,
                "full bounded RSS-evidence release must succeed");
        const auto rss_after_release = vm_rss_kib();
        require(ledger.owned_bytes() == 0, "full release must return all ledger ownership");
        std::cout << "bounded RSS evidence KiB: before=" << rss_before
                  << " after_prefetch=" << rss_after_prefetch
                  << " after_release=" << rss_after_release << '\n';
    }

    std::cout << "file-residency tests: PASS\n";
    return 0;
}
