#include "super_runtime/runtime_entry.h"
#include "super_runtime/runtime_workspace.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

namespace {

using super_runtime::RuntimeBudgetRequest;
using super_runtime::RuntimeEntry;
using super_runtime::RuntimeEntryResult;
using super_runtime::RuntimeFixtureSpec;
using super_runtime::RuntimeLifecycle;
using super_runtime::RuntimeWorkspaceRequirements;
using super_runtime::RuntimeWorkspaceResult;
using super_runtime::plan_cpu_dense_workspace;

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "runtime-entry test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

class TempWeightFile {
public:
    explicit TempWeightFile(const std::vector<float> & weights) {
        char path_template[] = "/tmp/super-runtime-entry-XXXXXX";
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

std::vector<float> apply_manual_layer(
        const float * weights,
        const std::vector<float> & input,
        std::uint64_t width) {
    require(input.size() == width, "manual oracle input width mismatch");
    std::vector<float> output(static_cast<std::size_t>(width), 0.0f);
    for (std::uint64_t row = 0; row < width; ++row) {
        float sum = 0.0f;
        for (std::uint64_t col = 0; col < width; ++col) {
            sum += weights[row * width + col] * input[static_cast<std::size_t>(col)];
        }
        output[static_cast<std::size_t>(row)] = sum;
    }
    return output;
}

std::vector<float> manual_oracle(
        const std::vector<float> & all_weights,
        std::uint64_t layer_count,
        std::uint64_t width,
        const std::vector<float> & input) {
    const std::uint64_t elements_per_layer = width * width;
    std::vector<float> state = input;
    for (std::uint64_t layer = 0; layer < layer_count; ++layer) {
        state = apply_manual_layer(
            all_weights.data() + static_cast<std::size_t>(layer * elements_per_layer),
            state,
            width);
    }
    return state;
}

float max_abs_diff(const std::vector<float> & a, const std::vector<float> & b) {
    require(a.size() == b.size(), "output sizes must match");
    float result = 0.0f;
    for (std::size_t i = 0; i < a.size(); ++i) {
        require(std::isfinite(a[i]) && std::isfinite(b[i]), "runtime/oracle output must remain finite");
        result = std::max(result, std::fabs(a[i] - b[i]));
    }
    return result;
}

RuntimeBudgetRequest feasible_budget(std::uint64_t page) {
    RuntimeBudgetRequest request{};
    request.host_ceiling_bytes = page * 7;
    request.runtime_overhead_bytes = page;
    request.context_state_bytes = page;
    request.compute_scratch_bytes = page;
    request.safety_reserve_bytes = page;
    request.dense_min_bytes = page;
    request.dense_preferred_bytes = page * 3;
    request.dense_share_percent = 100;
    return request;
}

} // namespace

int main() {
    constexpr std::uint64_t page = 4096;
    constexpr std::uint64_t width = 32;
    constexpr std::uint64_t layer_count = 4;
    static_assert(width * width * sizeof(float) == page, "fixture requires one page per dense layer");

    RuntimeWorkspaceRequirements workspace{};
    require(plan_cpu_dense_workspace(width, workspace) == RuntimeWorkspaceResult::Ok,
            "runtime fixture GGML workspace must be measurable before admission tests");
    require(workspace.metadata_bytes > 0 && workspace.metadata_bytes <= page,
            "width-32 metadata workspace must fit the fixture runtime-overhead page");
    require(workspace.compute_buffer_bytes > 0 && workspace.compute_buffer_bytes <= page,
            "width-32 compute workspace must fit the fixture compute-scratch page");
    std::vector<float> weights(static_cast<std::size_t>(layer_count * width * width));
    for (std::uint64_t layer = 0; layer < layer_count; ++layer) {
        for (std::uint64_t row = 0; row < width; ++row) {
            for (std::uint64_t col = 0; col < width; ++col) {
                const auto index = static_cast<std::size_t>(layer * width * width + row * width + col);
                weights[index] = static_cast<float>(0.004 + (layer + 1) * 0.0015 + row * 0.00008 + col * 0.000007);
            }
        }
    }
    TempWeightFile file(weights);
    RuntimeFixtureSpec fixture{file.path(), layer_count, width};

    std::vector<float> input(static_cast<std::size_t>(width));
    for (std::size_t i = 0; i < input.size(); ++i) {
        input[i] = static_cast<float>(0.01 + (i % 13) * 0.0015);
    }
    const auto oracle = manual_oracle(weights, layer_count, width, input);
    float successful_runtime_diff = 0.0f;

    {
        RuntimeEntry runtime;
        require(runtime.telemetry().state == RuntimeLifecycle::Empty,
                "new runtime must begin Empty");
        require(runtime.admit(feasible_budget(page)) == RuntimeEntryResult::InvalidState,
                "admission before fixture load must be rejected");

        require(runtime.load(fixture) == RuntimeEntryResult::Ok,
                "deterministic fixture must load");
        require(runtime.telemetry().state == RuntimeLifecycle::Loaded,
                "load must publish Loaded state");
        require(runtime.telemetry().mapped_weight_bytes == page * layer_count,
                "load must report fixture weight bytes");

        auto infeasible = feasible_budget(page);
        infeasible.host_ceiling_bytes = page * 4;
        infeasible.context_state_bytes = page * 4;
        require(runtime.admit(infeasible) == RuntimeEntryResult::BudgetRejected,
                "infeasible context must fail admission before runtime ownership is published");
        require(runtime.telemetry().state == RuntimeLifecycle::Loaded,
                "failed admission must preserve Loaded state");
        require(runtime.telemetry().current_owned_bytes == 0,
                "failed admission must publish no memory ownership");

        auto metadata_too_small = feasible_budget(page);
        metadata_too_small.runtime_overhead_bytes = workspace.metadata_bytes - 1;
        require(runtime.admit(metadata_too_small) == RuntimeEntryResult::BudgetRejected,
                "runtime-overhead bucket below measured GGML metadata must fail admission");
        require(runtime.telemetry().state == RuntimeLifecycle::Loaded &&
                    runtime.telemetry().current_owned_bytes == 0,
                "workspace metadata rejection must publish no runtime ownership");

        auto compute_too_small = feasible_budget(page);
        compute_too_small.compute_scratch_bytes = workspace.compute_buffer_bytes - 1;
        require(runtime.admit(compute_too_small) == RuntimeEntryResult::BudgetRejected,
                "compute-scratch bucket below measured GGML compute buffer must fail admission");
        require(runtime.telemetry().state == RuntimeLifecycle::Loaded &&
                    runtime.telemetry().current_owned_bytes == 0,
                "workspace compute rejection must publish no runtime ownership");
        const auto budget = feasible_budget(page);
        require(runtime.admit(budget) == RuntimeEntryResult::Ok,
                "feasible runtime request must admit");
        require(runtime.telemetry().state == RuntimeLifecycle::Admitted,
                "successful admission must publish Admitted state");
        require(runtime.telemetry().host_ceiling_bytes == page * 7,
                "telemetry must expose configured host ceiling");
        require(runtime.telemetry().planned_host_bytes == page * 7,
                "global plan should consume the requested fixture demand plus reserve");
        require(runtime.telemetry().dense_pinned_prefix_count == 1,
                "three-page dense residency budget must pin one of four layers");
        require(runtime.telemetry().dense_ring_slots == 2,
                "three-page dense residency budget must use two-slot look-ahead");        require(runtime.telemetry().ggml_metadata_required_bytes == workspace.metadata_bytes,
                "telemetry must report the measured GGML metadata requirement");
        require(runtime.telemetry().ggml_compute_required_bytes == workspace.compute_buffer_bytes,
                "telemetry must report the measured GGML compute-buffer requirement");
        require(runtime.telemetry().current_owned_bytes == page * 3,
                "admission must reserve actual fixed runtime/context/scratch ownership but not safety reserve");

        require(runtime.execute(input) == RuntimeEntryResult::Ok,
                "admitted deterministic fixture must execute");
        const auto & telemetry = runtime.telemetry();
        require(telemetry.state == RuntimeLifecycle::Completed,
                "successful execution must publish Completed state");
        require(telemetry.completed_layers == layer_count,
                "runtime must report all dense layers completed");
        require(telemetry.ready_before_compute_count == layer_count,
                "every layer must cross the residency-ready gate before compute");
        require(telemetry.peak_owned_bytes == page * 6,
                "runtime peak ownership must reconcile fixed ownership plus planned dense working set");
        require(telemetry.peak_owned_bytes <= telemetry.host_ceiling_bytes,
                "runtime-owned peak must never exceed the admitted host ceiling");
        require(telemetry.intentional_resident_bytes == 0,
                "execution cleanup must release all dynamic/pinned residency before Completed publication");
        require(telemetry.current_owned_bytes == page * 3,
                "fixed runtime ownership must remain until unload");
        successful_runtime_diff = max_abs_diff(oracle, telemetry.output);
        require(successful_runtime_diff <= 1e-6f,
                "runtime output must match independent manual oracle");

        require(runtime.unload() == RuntimeEntryResult::Ok,
                "completed runtime must unload cleanly");
        require(runtime.telemetry().state == RuntimeLifecycle::Unloaded,
                "unload must publish Unloaded state");
        require(runtime.telemetry().current_owned_bytes == 0,
                "unload must release all MemoryLedger ownership");
        require(runtime.telemetry().intentional_resident_bytes == 0,
                "unload must leave no intentional residency");
    }

    {
        RuntimeEntry runtime;
        require(runtime.load(fixture) == RuntimeEntryResult::Ok,
                "cancellation fixture must load");
        require(runtime.admit(feasible_budget(page)) == RuntimeEntryResult::Ok,
                "cancellation fixture must admit");

        std::uint64_t checks = 0;
        const auto result = runtime.execute(input, [&checks]() {
            return checks++ >= 1;
        });
        require(result == RuntimeEntryResult::Cancelled,
                "coarse cancellation request must be surfaced explicitly");
        const auto & telemetry = runtime.telemetry();
        require(telemetry.state == RuntimeLifecycle::Cancelled,
                "cancelled execution must publish Cancelled state");
        require(telemetry.completed_layers == 1,
                "cancellation fixture must stop after one completed safe layer boundary");
        require(telemetry.intentional_resident_bytes == 0,
                "cancelled execution must release file residency before returning");
        require(telemetry.current_owned_bytes == page * 3,
                "cancelled execution may retain admitted fixed ownership until unload");
        require(runtime.unload() == RuntimeEntryResult::Ok,
                "cancelled runtime must remain unloadable");
        require(runtime.telemetry().current_owned_bytes == 0,
                "cancelled unload must release all ledger ownership");
    }

    {
        RuntimeEntry runtime;
        RuntimeFixtureSpec bad = fixture;
        bad.layer_count = layer_count + 1;
        require(runtime.load(bad) == RuntimeEntryResult::LoadFailed,
                "fixture metadata inconsistent with file size must fail load");
        require(runtime.telemetry().state == RuntimeLifecycle::Empty,
                "failed load must not publish partial lifecycle state");
    }

    std::cout << "runtime-entry runtime-vs-oracle max_abs_diff=" << successful_runtime_diff << '\n';
    std::cout << "runtime-entry tests: PASS\n";
    return 0;
}
