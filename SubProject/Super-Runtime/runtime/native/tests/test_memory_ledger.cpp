#include "super_runtime/memory_ledger.h"

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <thread>
#include <vector>

namespace {

using super_runtime::MemoryCategory;
using super_runtime::MemoryLedger;

[[noreturn]] void fail(const char * message) {
    std::cerr << "memory-ledger test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const char * message) {
    if (!condition) {
        fail(message);
    }
}

void test_reservation_and_category_totals() {
    MemoryLedger ledger(1024);

    require(ledger.budget_bytes() == 1024, "budget must be retained exactly");
    require(ledger.owned_bytes() == 0, "new ledger must own zero bytes");
    require(ledger.reserve(MemoryCategory::ResidentWeights, 400), "resident-weight reservation must succeed");
    require(ledger.reserve(MemoryCategory::ContextState, 200), "context reservation must succeed");
    require(ledger.reserve(MemoryCategory::ComputeScratch, 100), "scratch reservation must succeed");

    require(ledger.owned_bytes() == 700, "owned total must equal accepted reservations");
    require(ledger.category_bytes(MemoryCategory::ResidentWeights) == 400, "resident-weight total mismatch");
    require(ledger.category_bytes(MemoryCategory::ContextState) == 200, "context total mismatch");
    require(ledger.category_bytes(MemoryCategory::ComputeScratch) == 100, "scratch total mismatch");
    require(ledger.category_bytes(MemoryCategory::Staging) == 0, "untouched staging category must remain zero");
}

void test_hard_budget_refusal_is_atomic() {
    MemoryLedger ledger(1000);
    require(ledger.reserve(MemoryCategory::RuntimeOverhead, 900), "initial reservation must succeed");
    require(!ledger.reserve(MemoryCategory::Staging, 101), "reservation above hard budget must be refused");
    require(ledger.owned_bytes() == 900, "refused reservation must not change owned total");
    require(ledger.category_bytes(MemoryCategory::Staging) == 0, "refused reservation must not change category total");
    require(ledger.reserve(MemoryCategory::Staging, 100), "reservation exactly to budget must succeed");
    require(ledger.owned_bytes() == ledger.budget_bytes(), "accepted mutation must never exceed budget");
}

void test_release_and_underflow_refusal() {
    MemoryLedger ledger(4096);
    require(ledger.reserve(MemoryCategory::AcceleratorMemory, 1024), "accelerator reservation must succeed");
    require(ledger.release(MemoryCategory::AcceleratorMemory, 256), "partial release must succeed");
    require(ledger.owned_bytes() == 768, "owned total must shrink after release");
    require(ledger.category_bytes(MemoryCategory::AcceleratorMemory) == 768, "category total must shrink after release");
    require(!ledger.release(MemoryCategory::AcceleratorMemory, 769), "release beyond category ownership must be refused");
    require(ledger.owned_bytes() == 768, "refused release must not change owned total");
    require(ledger.release(MemoryCategory::AcceleratorMemory, 768), "full remaining release must succeed");
    require(ledger.owned_bytes() == 0, "full release must return ledger to zero");
}

void test_integer_overflow_is_refused() {
    const auto max = std::numeric_limits<std::uint64_t>::max();
    MemoryLedger ledger(max);

    require(ledger.reserve(MemoryCategory::ResidentWeights, max - 4), "near-maximum reservation must succeed");
    require(!ledger.reserve(MemoryCategory::ContextState, 8), "overflowing total reservation must be refused");
    require(ledger.owned_bytes() == max - 4, "overflow refusal must preserve owned total");
    require(ledger.category_bytes(MemoryCategory::ContextState) == 0, "overflow refusal must preserve category total");
}

void test_all_required_categories_are_independent() {
    MemoryLedger ledger(600);
    const MemoryCategory categories[] = {
        MemoryCategory::ResidentWeights,
        MemoryCategory::ContextState,
        MemoryCategory::ComputeScratch,
        MemoryCategory::Staging,
        MemoryCategory::AcceleratorMemory,
        MemoryCategory::RuntimeOverhead,
    };

    for (const auto category : categories) {
        require(ledger.reserve(category, 100), "category reservation must succeed");
    }
    require(ledger.owned_bytes() == 600, "all category totals must contribute to global ownership");
    for (const auto category : categories) {
        require(ledger.category_bytes(category) == 100, "categories must account independently");
    }
}

void test_thread_safe_accounting() {
    constexpr std::size_t threads = 8;
    constexpr std::size_t iterations = 2000;
    MemoryLedger ledger(threads * iterations);

    std::vector<std::thread> workers;
    workers.reserve(threads);
    for (std::size_t index = 0; index < threads; ++index) {
        workers.emplace_back([&ledger]() {
            for (std::size_t i = 0; i < iterations; ++i) {
                if (!ledger.reserve(MemoryCategory::RuntimeOverhead, 1)) {
                    fail("concurrent reservation unexpectedly failed");
                }
            }
        });
    }
    for (auto & worker : workers) {
        worker.join();
    }

    require(ledger.owned_bytes() == threads * iterations, "concurrent reservations must not lose updates");
    require(ledger.owned_bytes() <= ledger.budget_bytes(), "concurrent ownership must respect budget invariant");

    workers.clear();
    for (std::size_t index = 0; index < threads; ++index) {
        workers.emplace_back([&ledger]() {
            for (std::size_t i = 0; i < iterations; ++i) {
                if (!ledger.release(MemoryCategory::RuntimeOverhead, 1)) {
                    fail("concurrent release unexpectedly failed");
                }
            }
        });
    }
    for (auto & worker : workers) {
        worker.join();
    }
    require(ledger.owned_bytes() == 0, "concurrent releases must return ownership to zero");
}

} // namespace

int main() {
    test_reservation_and_category_totals();
    test_hard_budget_refusal_is_atomic();
    test_release_and_underflow_refusal();
    test_integer_overflow_is_refused();
    test_all_required_categories_are_independent();
    test_thread_safe_accounting();

    std::cout << "memory-ledger tests: PASS\n";
    return 0;
}
