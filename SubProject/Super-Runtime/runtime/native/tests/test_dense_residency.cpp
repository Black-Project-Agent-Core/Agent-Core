#include "super_runtime/dense_residency.h"
#include "super_runtime/file_residency.h"
#include "super_runtime/memory_ledger.h"

#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

namespace {

using super_runtime::DenseLayerRange;
using super_runtime::DensePlanResult;
using super_runtime::DenseResidencyPlan;
using super_runtime::DenseResidencyPolicy;
using super_runtime::DenseResidencyResult;
using super_runtime::FileResidency;
using super_runtime::FileResidencyResult;
using super_runtime::MemoryLedger;
using super_runtime::plan_dense_residency;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "dense-residency test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

std::vector<DenseLayerRange> make_layers(std::uint64_t count, std::uint64_t bytes_per_layer) {
    std::vector<DenseLayerRange> layers;
    layers.reserve(static_cast<std::size_t>(count));
    for (std::uint64_t i = 0; i < count; ++i) {
        layers.push_back(DenseLayerRange{i * bytes_per_layer, bytes_per_layer});
    }
    return layers;
}

class TempWeightFile {
public:
    explicit TempWeightFile(const std::vector<float> & weights) {
        char path_template[] = "/tmp/super-runtime-dense-residency-XXXXXX";
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

std::vector<float> run_dense_layer(
        ggml_backend_t backend,
        const float * weights,
        std::uint64_t weight_bytes,
        const std::vector<float> & input,
        std::int64_t k,
        std::int64_t m) {
    ggml_init_params params = {
        /* .mem_size   = */ 256U * 1024U,
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };
    ggml_context * ctx = ggml_init(params);
    require(ctx != nullptr, "GGML dense context must initialize");

    ggml_tensor * weight = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, k, m);
    ggml_tensor * x = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, k, 1);
    ggml_tensor * out = ggml_mul_mat(ctx, weight, x);

    ggml_cgraph * graph = ggml_new_graph_custom(ctx, GGML_DEFAULT_GRAPH_SIZE, false);
    ggml_build_forward_expand(graph, out);

    ggml_backend_buffer_t weight_buffer = ggml_backend_cpu_buffer_from_ptr(
        const_cast<float *>(weights), static_cast<std::size_t>(weight_bytes));
    require(weight_buffer != nullptr, "GGML external weight buffer must initialize");
    require(
        ggml_backend_tensor_alloc(weight_buffer, weight, const_cast<float *>(weights)) == GGML_STATUS_SUCCESS,
        "GGML dense weight tensor must bind to the supplied stable address");
    require(weight->data == weights, "GGML dense weight tensor must preserve the supplied address");

    ggml_backend_buffer_t compute_buffer = ggml_backend_alloc_ctx_tensors(ctx, backend);
    require(compute_buffer != nullptr, "GGML dense compute buffer must allocate");
    require(input.size() == static_cast<std::size_t>(k), "dense input width must match k");
    ggml_backend_tensor_set(x, input.data(), 0, input.size() * sizeof(float));

    require(ggml_backend_graph_compute(backend, graph) == GGML_STATUS_SUCCESS,
            "GGML dense matmul must compute successfully");
    ggml_backend_synchronize(backend);

    std::vector<float> result(static_cast<std::size_t>(m));
    ggml_backend_tensor_get(out, result.data(), 0, result.size() * sizeof(float));

    ggml_backend_buffer_free(compute_buffer);
    ggml_backend_buffer_free(weight_buffer);
    ggml_free(ctx);
    return result;
}

std::vector<float> run_dense_sequence(
        ggml_backend_t backend,
        const std::uint8_t * base,
        const std::vector<DenseLayerRange> & layers,
        const std::vector<float> & initial,
        std::int64_t k,
        std::int64_t m) {
    std::vector<float> state = initial;
    for (const auto & layer : layers) {
        const auto * weights = reinterpret_cast<const float *>(base + layer.offset);
        state = run_dense_layer(backend, weights, layer.length, state, k, m);
    }
    return state;
}

float max_abs_diff(const std::vector<float> & a, const std::vector<float> & b) {
    require(a.size() == b.size(), "parity vectors must have equal size");
    float result = 0.0f;
    for (std::size_t i = 0; i < a.size(); ++i) {
        require(std::isfinite(a[i]) && std::isfinite(b[i]), "parity output must remain finite");
        result = std::max(result, std::fabs(a[i] - b[i]));
    }
    return result;
}

} // namespace

int main() {
    constexpr std::uint64_t page = 4096;

    {
        const auto layers = make_layers(6, page);
        DenseResidencyPlan plan;
        require(plan_dense_residency(layers, page, page * 4, plan) == DensePlanResult::Ok,
                "four-page budget must produce a valid six-layer plan");
        require(plan.pinned_prefix_count == 2, "two layers must be deterministically pinned");
        require(plan.ring_slots == 2, "two-slot ring must be preferred when the budget permits it");
        require(plan.pinned_bytes == page * 2, "pinned-byte total must match the prefix");
        require(plan.required_budget_bytes == page * 4, "required budget must include prefix plus two ring slots");
        require(std::fabs(plan.pinned_hit_ratio() - (2.0 / 6.0)) < 1e-12,
                "pinned hit ratio must be exactly prefix/layer-count");
    }

    {
        const auto layers = make_layers(6, page);
        DenseResidencyPlan plan;
        require(plan_dense_residency(layers, page, page, plan) == DensePlanResult::Ok,
                "one-page budget must retain a correctness-preserving one-slot plan");
        require(plan.pinned_prefix_count == 0, "one-slot fallback cannot afford a pinned prefix here");
        require(plan.ring_slots == 1, "one-page budget must disable look-ahead and use one slot");
        require(plan.required_budget_bytes == page, "one-slot plan must require one page");
        require(plan.pinned_hit_ratio() == 0.0, "one-slot no-prefix plan must have zero pinned hit ratio");
    }

    {
        const auto layers = make_layers(6, page);
        DenseResidencyPlan plan;
        require(plan_dense_residency(layers, page, page * 6, plan) == DensePlanResult::Ok,
                "full-weight budget must permit all layers to stay pinned");
        require(plan.pinned_prefix_count == 6, "all layers must be pinned when the entire walk fits");
        require(plan.ring_slots == 0, "all-pinned plan must not allocate a streaming ring");
        require(plan.required_budget_bytes == page * 6, "all-pinned plan budget must equal total layer bytes");
        require(plan.pinned_hit_ratio() == 1.0, "all-pinned plan must have 100 percent pinned hit ratio");
    }

    {
        DenseResidencyPlan plan;
        require(plan_dense_residency(make_layers(2, page), page, page - 1, plan)
                    == DensePlanResult::BudgetTooSmall,
                "budget below the largest layer must fail closed");
        require(plan.layers.empty(), "budget failure must not publish a partial plan");

        auto bad = make_layers(2, page);
        bad[0].offset = 1;
        require(plan_dense_residency(bad, page, page * 2, plan) == DensePlanResult::InvalidArgument,
                "unaligned dense range must be rejected");

        bad = make_layers(2, page);
        bad[1].offset = page / 2;
        require(plan_dense_residency(bad, page, page * 2, plan) == DensePlanResult::InvalidArgument,
                "overlapping/out-of-order dense ranges must be rejected");

        bad = {DenseLayerRange{std::numeric_limits<std::uint64_t>::max() - page + 1, page}};
        require(plan_dense_residency(bad, page, std::numeric_limits<std::uint64_t>::max(), plan)
                    == DensePlanResult::Overflow,
                "dense range arithmetic overflow must fail closed");
    }

#ifdef __linux__
    constexpr std::int64_t k = 32;
    constexpr std::int64_t m = 32;
    constexpr std::uint64_t layer_count = 4;
    static_assert(k * m * static_cast<std::int64_t>(sizeof(float)) == static_cast<std::int64_t>(page),
                  "dense parity fixture requires exactly one page per layer");

    const auto layers = make_layers(layer_count, page);
    std::vector<float> all_weights(static_cast<std::size_t>(layer_count * k * m));
    for (std::uint64_t layer = 0; layer < layer_count; ++layer) {
        for (std::int64_t row = 0; row < m; ++row) {
            for (std::int64_t col = 0; col < k; ++col) {
                const auto index = static_cast<std::size_t>(layer * k * m + row * k + col);
                all_weights[index] = static_cast<float>(
                    0.005 + (layer + 1) * 0.002 + row * 0.0001 + col * 0.00001);
            }
        }
    }
    TempWeightFile file(all_weights);

    std::vector<float> input(static_cast<std::size_t>(k));
    for (std::size_t i = 0; i < input.size(); ++i) {
        input[i] = static_cast<float>(0.01 + (i % 11) * 0.002);
    }

    ggml_backend_t backend = ggml_backend_cpu_init();
    require(backend != nullptr, "GGML CPU backend must initialize for dense parity");
    ggml_backend_cpu_set_n_threads(backend, 1);

    std::vector<float> baseline;
    {
        MemoryLedger ledger(page * layer_count);
        FileResidency residency(file.path(), ledger);
        require(residency.prefetch(0, page * layer_count) == FileResidencyResult::Ok,
                "fully resident dense baseline must materialize all layers");
        baseline = run_dense_sequence(
            backend,
            static_cast<const std::uint8_t *>(residency.data()),
            layers,
            input,
            k,
            m);
        require(residency.release(0, page * layer_count) == FileResidencyResult::Ok,
                "fully resident dense baseline must release cleanly");
        require(ledger.owned_bytes() == 0, "baseline must return all resident-weight ownership");
    }

    {
        DenseResidencyPlan plan;
        require(plan_dense_residency(layers, page, page * 3, plan) == DensePlanResult::Ok,
                "three-page dense budget must create pinned-prefix plus two-slot plan");
        require(plan.pinned_prefix_count == 1, "three-page plan must pin exactly one of four layers");
        require(plan.ring_slots == 2, "three-page plan must retain two-slot look-ahead");

        MemoryLedger ledger(page * 3);
        FileResidency residency(file.path(), ledger);
        DenseResidencyPolicy policy(residency, plan);
        require(policy.start() == DenseResidencyResult::Ok, "two-slot dense policy must start");
        require(ledger.owned_bytes() == page, "policy start must materialize only the pinned prefix");

        std::vector<float> state = input;
        std::uint64_t peak_owned = ledger.owned_bytes();
        for (std::uint64_t layer = 0; layer < layer_count; ++layer) {
            require(policy.prepare(layer) == DenseResidencyResult::Ok,
                    "dense two-slot prepare must follow graph order");
            require(policy.is_intentionally_resident(layer), "current dense layer must be resident before compute");
            peak_owned = std::max(peak_owned, ledger.owned_bytes());
            require(ledger.owned_bytes() <= page * 3, "two-slot policy must never overshoot its budget");

            const auto * weights = reinterpret_cast<const float *>(
                static_cast<const std::uint8_t *>(residency.data()) + layers[layer].offset);
            state = run_dense_layer(backend, weights, layers[layer].length, state, k, m);

            require(policy.complete(layer) == DenseResidencyResult::Ok,
                    "dense two-slot complete must release the safe current dynamic layer");
            peak_owned = std::max(peak_owned, ledger.owned_bytes());
            require(ledger.owned_bytes() <= page * 3, "two-slot completion must preserve budget invariant");
        }

        require(peak_owned == page * 3, "two-slot fixture must exercise the full three-page planned working set");
        require(max_abs_diff(baseline, state) <= 1e-6f,
                "two-slot residency-managed dense output must match fully resident GGML baseline");
        require(policy.stop() == DenseResidencyResult::Ok, "two-slot dense policy must stop cleanly");
        require(ledger.owned_bytes() == 0, "two-slot policy stop must release pinned residency");

        std::cout << "dense two-slot parity max_abs_diff=" << max_abs_diff(baseline, state)
                  << " peak_owned_bytes=" << peak_owned << '\n';
    }

    {
        DenseResidencyPlan plan;
        require(plan_dense_residency(layers, page, page, plan) == DensePlanResult::Ok,
                "one-page dense budget must create synchronous fallback");
        require(plan.pinned_prefix_count == 0 && plan.ring_slots == 1,
                "one-page plan must be exactly one-slot with no prefix");

        MemoryLedger ledger(page);
        FileResidency residency(file.path(), ledger);
        DenseResidencyPolicy policy(residency, plan);
        require(policy.start() == DenseResidencyResult::Ok, "one-slot dense policy must start");

        std::vector<float> state = input;
        std::uint64_t peak_owned = 0;

        require(policy.prepare(0) == DenseResidencyResult::Ok,
                "one-slot policy must materialize the first layer synchronously");
        require(residency.release(0, page) == FileResidencyResult::InUse,
                "active current layer must hold a lease that blocks external reclaim");
        require(policy.prepare(1) == DenseResidencyResult::Busy,
                "one-slot policy must reject overwrite/advance while current layer is active");
        require(ledger.owned_bytes() == page,
                "busy/reclaim rejection must keep only the active current layer resident");
        peak_owned = std::max(peak_owned, ledger.owned_bytes());

        const auto * first_weights = reinterpret_cast<const float *>(residency.data());
        state = run_dense_layer(backend, first_weights, layers[0].length, state, k, m);
        require(policy.complete(0) == DenseResidencyResult::Ok,
                "one-slot policy must release current only after explicit safe completion");
        require(ledger.owned_bytes() == 0, "one-slot completion must free the slot before next load");

        for (std::uint64_t layer = 1; layer < layer_count; ++layer) {
            require(policy.prepare(layer) == DenseResidencyResult::Ok,
                    "one-slot dense prepare must progress sequentially after completion");
            require(ledger.owned_bytes() == page, "one-slot prepare must own exactly one page");
            peak_owned = std::max(peak_owned, ledger.owned_bytes());

            const auto * weights = reinterpret_cast<const float *>(
                static_cast<const std::uint8_t *>(residency.data()) + layers[layer].offset);
            state = run_dense_layer(backend, weights, layers[layer].length, state, k, m);

            require(policy.complete(layer) == DenseResidencyResult::Ok,
                    "one-slot completion must release the active layer");
            require(ledger.owned_bytes() == 0, "one-slot completion must return to zero dynamic ownership");
        }

        require(peak_owned == page, "one-slot fixture must never exceed one page of resident weights");
        require(max_abs_diff(baseline, state) <= 1e-6f,
                "one-slot residency-managed dense output must match fully resident GGML baseline");
        require(policy.stop() == DenseResidencyResult::Ok, "one-slot policy must stop cleanly");
        require(ledger.owned_bytes() == 0, "one-slot policy must leave the ledger empty");

        std::cout << "dense one-slot parity max_abs_diff=" << max_abs_diff(baseline, state)
                  << " peak_owned_bytes=" << peak_owned << '\n';
    }

    ggml_backend_free(backend);
#endif

    std::cout << "dense-residency tests: PASS\n";
    return 0;
}
