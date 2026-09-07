#include "super_runtime/file_residency.h"
#include "super_runtime/memory_ledger.h"
#include "super_runtime/moe_residency.h"

#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#if defined(__linux__)
#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>
#endif

namespace {

using super_runtime::ByteRange;
using super_runtime::FileResidency;
using super_runtime::FileResidencyLease;
using super_runtime::FileResidencyResult;
using super_runtime::MemoryCategory;
using super_runtime::MemoryLedger;
using super_runtime::MoeExpertLayout;
using super_runtime::MoePlanResult;
using super_runtime::StridedExpertIds;
using super_runtime::plan_moe_residency;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "moe-residency test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

struct IdFixture {
    std::vector<std::int32_t> storage;
    std::uint64_t row_width = 0;
    std::uint64_t used_per_token = 0;
    std::uint64_t token_count = 0;

    [[nodiscard]] StridedExpertIds view() const noexcept {
        return StridedExpertIds{
            storage.data(),
            used_per_token,
            token_count,
            sizeof(std::int32_t),
            row_width * sizeof(std::int32_t),
            storage.size() * sizeof(std::int32_t),
        };

    }

    [[nodiscard]] StridedExpertIds view_with_bytes(std::uint64_t data_bytes) const noexcept {
        auto result = view();
        result.data_bytes = data_bytes;
        return result;
    }

};

IdFixture make_ids(const std::vector<std::array<std::int32_t, 4>> & rows, std::uint64_t used_per_token = 2) {
    IdFixture result;
    result.row_width = 4;
    result.used_per_token = used_per_token;
    result.token_count = rows.size();
    result.storage.reserve(rows.size() * result.row_width);
    for (const auto & row : rows) {
        result.storage.insert(result.storage.end(), row.begin(), row.end());
    }
    return result;
}

void require_range(const ByteRange & range, std::uint64_t offset, std::uint64_t length, const std::string & label) {
    require(range.offset == offset, label + " offset mismatch");
    require(range.length == length, label + " length mismatch");
}

#if defined(__linux__)
class TempWeightFile {
public:
    explicit TempWeightFile(const std::vector<float> & weights) {
        char path_template[] = "/tmp/super-runtime-moe-residency-XXXXXX";
        const int fd = ::mkstemp(path_template);
        if (fd < 0) {
            throw std::runtime_error("mkstemp failed");
        }
        path_ = path_template;

        const auto * bytes = reinterpret_cast<const std::uint8_t *>(weights.data());
        const std::size_t total = weights.size() * sizeof(float);
        std::size_t written = 0;
        while (written < total) {
            const auto rc = ::write(fd, bytes + written, total - written);
            if (rc < 0) {
                ::close(fd);
                ::unlink(path_.c_str());
                throw std::runtime_error("write failed");
            }
            written += static_cast<std::size_t>(rc);
        }
        if (::fsync(fd) != 0) {
            ::close(fd);
            ::unlink(path_.c_str());
            throw std::runtime_error("fsync failed");
        }
        ::close(fd);
    }

    ~TempWeightFile() {
        if (!path_.empty()) {
            ::unlink(path_.c_str());
        }
    }

    TempWeightFile(const TempWeightFile &) = delete;
    TempWeightFile & operator=(const TempWeightFile &) = delete;

    [[nodiscard]] const std::string & path() const noexcept {
        return path_;
    }

private:
    std::string path_;
};

std::vector<float> run_mul_mat_id(
        const std::vector<float> & expert_weights,
        const std::vector<std::int32_t> & ids_full,
        const std::vector<float> & input,
        std::int64_t k,
        std::int64_t m,
        std::int64_t n_experts,
        std::int64_t n_used,
        std::int64_t n_tokens) {
    ggml_backend_t backend = ggml_backend_cpu_init();
    require(backend != nullptr, "GGML CPU backend must initialize");
    ggml_backend_cpu_set_n_threads(backend, 1);

    ggml_init_params params = {
        /* .mem_size   = */ 2U * 1024U * 1024U,
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };
    ggml_context * ctx = ggml_init(params);
    require(ctx != nullptr, "GGML context must initialize");

    ggml_tensor * as = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, k, m, n_experts);
    ggml_tensor * ids_storage = ggml_new_tensor_2d(ctx, GGML_TYPE_I32, n_experts, n_tokens);
    ggml_tensor * ids = ggml_view_2d(ctx, ids_storage, n_used, n_tokens, ids_storage->nb[1], 0);
    ggml_tensor * b = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, k, n_used, n_tokens);
    ggml_tensor * out = ggml_mul_mat_id(ctx, as, b, ids);

    ggml_cgraph * graph = ggml_new_graph_custom(ctx, GGML_DEFAULT_GRAPH_SIZE, false);
    ggml_build_forward_expand(graph, out);

    ggml_backend_buffer_t buffer = ggml_backend_alloc_ctx_tensors(ctx, backend);
    require(buffer != nullptr, "GGML tensor allocation must succeed");

    ggml_backend_tensor_set(as, expert_weights.data(), 0, expert_weights.size() * sizeof(float));
    ggml_backend_tensor_set(ids_storage, ids_full.data(), 0, ids_full.size() * sizeof(std::int32_t));
    ggml_backend_tensor_set(b, input.data(), 0, input.size() * sizeof(float));

    const auto status = ggml_backend_graph_compute(backend, graph);
    require(status == GGML_STATUS_SUCCESS, "GGML MUL_MAT_ID graph must compute successfully");
    ggml_backend_synchronize(backend);

    std::vector<float> result(static_cast<std::size_t>(ggml_nelements(out)));
    ggml_backend_tensor_get(out, result.data(), 0, result.size() * sizeof(float));

    ggml_backend_buffer_free(buffer);
    ggml_free(ctx);
    ggml_backend_free(backend);
    return result;
}
#endif

} // namespace

int main() {
    constexpr std::uint64_t page = 4096;

    {
        const auto ids = make_ids({
            std::array<std::int32_t, 4>{3, 1, 7, 7},
            std::array<std::int32_t, 4>{2, 1, 7, 7},
            std::array<std::int32_t, 4>{1, 3, 7, 7},
        });
        const MoeExpertLayout layout{
            /* .expert_count = */ 8,
            /* .tensor_offset = */ page * 2,
            /* .expert_stride = */ page,
            /* .mapping_size = */ page * 10,
            /* .residency_alignment = */ page,
        };

        std::vector<ByteRange> ranges;
        require(plan_moe_residency(ids.view(), layout, ranges) == MoePlanResult::Ok,
                "unsorted duplicate IDs must produce a valid plan");
        require(ranges.size() == 1, "adjacent selected experts 1,2,3 must coalesce into one range");
        require_range(ranges[0], page * 3, page * 3, "coalesced 1-3 range");
    }

    {
        const auto ids = make_ids({
            std::array<std::int32_t, 4>{5, 0, 7, 7},
            std::array<std::int32_t, 4>{3, 5, 7, 7},
        });
        const MoeExpertLayout layout{8, page, page, page * 10, page};
        std::vector<ByteRange> ranges;
        require(plan_moe_residency(ids.view(), layout, ranges) == MoePlanResult::Ok,
                "sparse expert IDs must produce a valid plan");
        require(ranges.size() == 3, "sparse experts 0,3,5 must remain three ranges");
        require_range(ranges[0], page, page, "expert 0 range");
        require_range(ranges[1], page * 4, page, "expert 3 range");
        require_range(ranges[2], page * 6, page, "expert 5 range");
    }

    {
        auto ids = make_ids({std::array<std::int32_t, 4>{8, 0, 7, 7}});
        const MoeExpertLayout layout{8, 0, page, page * 8, page};
        std::vector<ByteRange> ranges{{123, 456}};
        require(plan_moe_residency(ids.view(), layout, ranges) == MoePlanResult::InvalidExpertId,
                "expert ID equal to expert_count must fail closed");
        require(ranges.empty(), "invalid expert ID must not publish a partial plan");

        ids.storage[0] = -1;
        ranges.push_back({1, 1});
        require(plan_moe_residency(ids.view(), layout, ranges) == MoePlanResult::InvalidExpertId,
                "negative expert ID must fail closed");
        require(ranges.empty(), "negative expert ID must not publish a partial plan");
    }

    {
        const auto ids = make_ids({std::array<std::int32_t, 4>{1, 0, 7, 7}});
        std::vector<ByteRange> ranges;

        require(plan_moe_residency(ids.view(), MoeExpertLayout{0, 0, page, page * 4, page}, ranges)
                    == MoePlanResult::InvalidArgument,
                "zero expert_count must be rejected");
        require(plan_moe_residency(ids.view(), MoeExpertLayout{4, 0, 0, page * 4, page}, ranges)
                    == MoePlanResult::InvalidArgument,
                "zero expert stride must be rejected");
        require(plan_moe_residency(ids.view(), MoeExpertLayout{4, 0, page, page * 4, 0}, ranges)
                    == MoePlanResult::InvalidArgument,
                "zero residency alignment must be rejected");

        auto bad_view = ids.view();
        bad_view.expert_stride_bytes = 0;
        require(plan_moe_residency(bad_view, MoeExpertLayout{4, 0, page, page * 4, page}, ranges)
                    == MoePlanResult::InvalidArgument,
                "zero logical ID stride must be rejected");
    }

    {
        const auto ids = make_ids({
            std::array<std::int32_t, 4>{1, 0, 7, 7},
            std::array<std::int32_t, 4>{2, 3, 7, 7},
        });
        const MoeExpertLayout layout{8, 0, page, page * 8, page};
        const auto bounded = ids.view();
        const auto last_reachable_end =
            (bounded.token_count - 1) * bounded.token_stride_bytes +
            (bounded.experts_per_token - 1) * bounded.expert_stride_bytes +
            sizeof(std::int32_t);
        auto truncated = ids.view_with_bytes(last_reachable_end - 1);

        std::vector<ByteRange> ranges{{123, 456}};
        require(plan_moe_residency(truncated, layout, ranges) == MoePlanResult::InvalidArgument,
                "selector backing buffer shorter than the last reachable int32 must fail closed");
        require(ranges.empty(), "truncated selector input must not publish a partial plan");
    }
    {
        const auto ids = make_ids({std::array<std::int32_t, 4>{1, 0, 7, 7}});
        const MoeExpertLayout overflow_layout{
            4,
            std::numeric_limits<std::uint64_t>::max() - page + 1,
            page,
            std::numeric_limits<std::uint64_t>::max(),
            page,
        };
        std::vector<ByteRange> ranges;
        require(plan_moe_residency(ids.view(), overflow_layout, ranges) == MoePlanResult::Overflow,
                "offset arithmetic overflow must fail closed");
        require(ranges.empty(), "overflow must not publish a partial plan");
    }

#ifdef __linux__
    {
        constexpr std::int64_t n_experts = 4;
        constexpr std::int64_t n_used = 2;
        constexpr std::int64_t n_tokens = 3;
        constexpr std::int64_t k = 32;
        constexpr std::int64_t m = 32;
        static_assert(k * m * static_cast<std::int64_t>(sizeof(float)) == static_cast<std::int64_t>(page),
                "parity fixture requires exactly one page per expert");

        std::vector<float> full_weights(static_cast<std::size_t>(n_experts * k * m));
        for (std::int64_t expert = 0; expert < n_experts; ++expert) {
            for (std::int64_t row = 0; row < m; ++row) {
                for (std::int64_t col = 0; col < k; ++col) {
                    const auto index = static_cast<std::size_t>(expert * k * m + row * k + col);
                    full_weights[index] = static_cast<float>((expert + 1) * 0.01 + row * 0.001 + col * 0.0001);
                }
            }
        }

        const std::vector<std::int32_t> ids_full = {
            3, 1, 2, 0,
            0, 3, 2, 1,
            1, 3, 0, 2,
        };
        const StridedExpertIds selected_view{
            ids_full.data(),
            static_cast<std::uint64_t>(n_used),
            static_cast<std::uint64_t>(n_tokens),
            sizeof(std::int32_t),
            static_cast<std::uint64_t>(n_experts * sizeof(std::int32_t)),
            ids_full.size() * sizeof(std::int32_t),
        };

        const MoeExpertLayout layout{
            static_cast<std::uint64_t>(n_experts),
            0,
            page,
            page * static_cast<std::uint64_t>(n_experts),
            page,
        };

        std::vector<ByteRange> ranges;
        require(plan_moe_residency(selected_view, layout, ranges) == MoePlanResult::Ok,
                "GGML parity fixture selected IDs must plan successfully");
        require(ranges.size() == 2, "selected union {0,1,3} must produce two coalesced ranges");
        require_range(ranges[0], 0, page * 2, "GGML selected experts 0-1");
        require_range(ranges[1], page * 3, page, "GGML selected expert 3");

        TempWeightFile file(full_weights);
        MemoryLedger ledger(page * 3);
        FileResidency residency(file.path(), ledger);
        require(residency.size_bytes() == page * static_cast<std::uint64_t>(n_experts),
                "parity weight file must map the expected expert bytes");

        std::vector<float> managed_weights(full_weights.size(), std::numeric_limits<float>::quiet_NaN());
        auto * managed_bytes = reinterpret_cast<std::uint8_t *>(managed_weights.data());
        for (const auto & range : ranges) {
            require(residency.prefetch(range.offset, range.length) == FileResidencyResult::Ok,
                    "planned selected range must be admitted by FileResidency");
            FileResidencyLease lease;
            require(residency.acquire_lease(range.offset, range.length, lease) == FileResidencyResult::Ok,
                    "planned selected range must be leased before dereference");
            require(lease.data() != nullptr && lease.size_bytes() == range.length,
                    "selected expert lease must expose exactly the selected range");
            std::memcpy(managed_bytes + range.offset, lease.data(), static_cast<std::size_t>(range.length));
            lease.reset();
        }

        require(ledger.category_bytes(MemoryCategory::ResidentWeights) == page * 3,
                "selected union must charge exactly three resident expert pages");

        std::vector<float> input(static_cast<std::size_t>(k * n_used * n_tokens));
        for (std::size_t i = 0; i < input.size(); ++i) {
            input[i] = static_cast<float>(0.02 + (i % 17) * 0.003);
        }

        const auto baseline = run_mul_mat_id(full_weights, ids_full, input, k, m, n_experts, n_used, n_tokens);
        const auto managed = run_mul_mat_id(managed_weights, ids_full, input, k, m, n_experts, n_used, n_tokens);
        require(baseline.size() == managed.size(), "parity outputs must have identical shape");

        float max_abs_diff = 0.0f;
        for (std::size_t i = 0; i < baseline.size(); ++i) {
            require(std::isfinite(managed[i]), "managed MUL_MAT_ID output must remain finite with unselected experts poisoned");
            max_abs_diff = std::max(max_abs_diff, std::fabs(baseline[i] - managed[i]));
        }
        require(max_abs_diff <= 1e-6f,
                "residency-planned selected experts must match fully resident GGML MUL_MAT_ID output");

        for (const auto & range : ranges) {
            require(residency.release(range.offset, range.length) == FileResidencyResult::Ok,
                    "planned selected range must release cleanly");
        }
        require(ledger.owned_bytes() == 0, "MoE parity fixture must release all resident-weight ownership");

        std::cout << "GGML MUL_MAT_ID parity max_abs_diff=" << max_abs_diff << '\n';
    }
#endif

    std::cout << "moe-residency tests: PASS\n";
    return 0;
}
