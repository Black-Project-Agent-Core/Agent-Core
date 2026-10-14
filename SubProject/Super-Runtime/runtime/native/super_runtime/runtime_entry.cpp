#include "runtime_entry.h"

#include "dense_residency.h"
#include "file_residency.h"
#include "memory_ledger.h"
#include "runtime_workspace.h"

#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <limits>
#include <memory>
#include <utility>
#include <vector>

namespace super_runtime {
namespace {

bool multiply_checked(std::uint64_t a, std::uint64_t b, std::uint64_t & out) noexcept {
    if (a != 0 && b > std::numeric_limits<std::uint64_t>::max() / a) {
        return false;
    }
    out = a * b;
    return true;
}

bool file_size_bytes(const std::string & path, std::uint64_t & size) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        return false;
    }
    const auto end = file.tellg();
    if (end <= 0) {
        return false;
    }
    const auto unsigned_end = static_cast<std::uint64_t>(end);
    size = unsigned_end;
    return true;
}

bool reserve_fixed_ownership(MemoryLedger & ledger, const RuntimeBudgetRequest & request) {
    return ledger.reserve(MemoryCategory::RuntimeOverhead, request.runtime_overhead_bytes)
        && ledger.reserve(MemoryCategory::ResidentWeights, request.mandatory_weights_bytes)
        && ledger.reserve(MemoryCategory::ContextState, request.context_state_bytes)
        && ledger.reserve(MemoryCategory::ComputeScratch, request.compute_scratch_bytes)
        && ledger.reserve(MemoryCategory::Staging, request.staging_bytes);
}

bool run_dense_layer(
        ggml_backend_t backend,
        const float * weights,
        std::uint64_t weight_bytes,
        const std::vector<float> & input,
        std::uint64_t width,
        const RuntimeWorkspaceRequirements & workspace,
        std::vector<float> & output) {
    if (backend == nullptr || weights == nullptr || width == 0 || input.size() != width ||
        workspace.metadata_bytes == 0 || workspace.compute_buffer_bytes == 0 ||
        workspace.metadata_bytes > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max()) ||
        workspace.compute_buffer_bytes > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        return false;
    }

    ggml_init_params params = {
        /* .mem_size   = */ static_cast<std::size_t>(workspace.metadata_bytes),
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };

    ggml_context * ctx = ggml_init(params);
    if (ctx == nullptr) {
        return false;
    }

    ggml_backend_buffer_t weight_buffer = nullptr;
    ggml_backend_buffer_t compute_buffer = nullptr;
    bool ok = false;

    do {
        ggml_tensor * weight = ggml_new_tensor_2d(
            ctx,
            GGML_TYPE_F32,
            static_cast<std::int64_t>(width),
            static_cast<std::int64_t>(width));
        ggml_tensor * x = ggml_new_tensor_2d(
            ctx,
            GGML_TYPE_F32,
            static_cast<std::int64_t>(width),
            1);
        ggml_tensor * result = ggml_mul_mat(ctx, weight, x);
        if (weight == nullptr || x == nullptr || result == nullptr) {
            break;
        }

        ggml_cgraph * graph = ggml_new_graph_custom(ctx, runtime_dense_graph_size, false);
        if (graph == nullptr) {
            break;
        }
        ggml_build_forward_expand(graph, result);

        weight_buffer = ggml_backend_cpu_buffer_from_ptr(
            const_cast<float *>(weights),
            static_cast<std::size_t>(weight_bytes));
        if (weight_buffer == nullptr) {
            break;
        }
        if (ggml_backend_tensor_alloc(weight_buffer, weight, const_cast<float *>(weights)) != GGML_STATUS_SUCCESS) {
            break;
        }
        if (weight->data != weights) {
            break;
        }

        const std::size_t predicted_compute_bytes = ggml_backend_alloc_ctx_tensors_from_buft_size(
            ctx,
            ggml_backend_cpu_buffer_type());
        if (predicted_compute_bytes == 0 ||
            predicted_compute_bytes != static_cast<std::size_t>(workspace.compute_buffer_bytes)) {
            break;
        }

        compute_buffer = ggml_backend_alloc_ctx_tensors(ctx, backend);
        if (compute_buffer == nullptr) {
            break;
        }


        ggml_backend_tensor_set(x, input.data(), 0, input.size() * sizeof(float));
        if (ggml_backend_graph_compute(backend, graph) != GGML_STATUS_SUCCESS) {
            break;
        }
        ggml_backend_synchronize(backend);

        output.resize(static_cast<std::size_t>(width));
        ggml_backend_tensor_get(result, output.data(), 0, output.size() * sizeof(float));
        ok = true;
    } while (false);

    if (compute_buffer != nullptr) {
        ggml_backend_buffer_free(compute_buffer);
    }
    if (weight_buffer != nullptr) {
        ggml_backend_buffer_free(weight_buffer);
    }
    ggml_free(ctx);
    return ok;
}

} // namespace

class RuntimeEntry::Impl {
public:
    RuntimeFixtureSpec fixture;
    RuntimeBudgetRequest budget_request;
    RuntimeBudgetPlan budget_plan;
    RuntimeWorkspaceRequirements workspace_requirements;
    RuntimeTelemetry telemetry;

    std::uint64_t layer_bytes = 0;
    std::uint64_t file_bytes = 0;

    std::unique_ptr<MemoryLedger> ledger;
    std::unique_ptr<FileResidency> residency;
    std::unique_ptr<DenseResidencyPolicy> dense_policy;
    ggml_backend_t backend = nullptr;

    void update_memory_telemetry() noexcept {
        telemetry.current_owned_bytes = ledger != nullptr ? ledger->owned_bytes() : 0;
        telemetry.intentional_resident_bytes = residency != nullptr ? residency->intentional_resident_bytes() : 0;
        telemetry.peak_owned_bytes = std::max(telemetry.peak_owned_bytes, telemetry.current_owned_bytes);
    }

    void release_runtime_resources() noexcept {
        if (dense_policy != nullptr) {
            (void)dense_policy->stop();
            dense_policy.reset();
        }
        residency.reset();
        if (backend != nullptr) {
            ggml_backend_free(backend);
            backend = nullptr;
        }
        ledger.reset();
        telemetry.current_owned_bytes = 0;
        telemetry.intentional_resident_bytes = 0;
    }

    RuntimeEntryResult cancel_at_safe_point(const std::vector<float> & partial_output) {
        if (dense_policy != nullptr && dense_policy->stop() != DenseResidencyResult::Ok) {
            telemetry.state = RuntimeLifecycle::Failed;
            update_memory_telemetry();
            return RuntimeEntryResult::ResidencyError;
        }
        telemetry.output = partial_output;
        telemetry.state = RuntimeLifecycle::Cancelled;
        update_memory_telemetry();
        return RuntimeEntryResult::Cancelled;
    }

    RuntimeEntryResult fail_after_prepare(std::uint64_t layer, RuntimeEntryResult failure) {
        if (dense_policy != nullptr) {
            (void)dense_policy->complete(layer);
            (void)dense_policy->stop();
        }
        telemetry.state = RuntimeLifecycle::Failed;
        update_memory_telemetry();
        return failure;
    }
};

RuntimeEntry::RuntimeEntry()
    : impl_(std::make_unique<Impl>()) {
}

RuntimeEntry::~RuntimeEntry() noexcept {
    if (impl_ != nullptr) {
        (void)unload();
    }
}

RuntimeEntry::RuntimeEntry(RuntimeEntry &&) noexcept = default;
RuntimeEntry & RuntimeEntry::operator=(RuntimeEntry &&) noexcept = default;

RuntimeEntryResult RuntimeEntry::load(const RuntimeFixtureSpec & fixture) {
    if (impl_ == nullptr) {
        return RuntimeEntryResult::InvalidState;
    }
    if (impl_->telemetry.state != RuntimeLifecycle::Empty
        && impl_->telemetry.state != RuntimeLifecycle::Unloaded) {
        return RuntimeEntryResult::InvalidState;
    }
    if (fixture.weights_path.empty() || fixture.layer_count == 0 || fixture.width == 0
        || fixture.width > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max())) {
        return RuntimeEntryResult::InvalidArgument;
    }

    std::uint64_t elements_per_layer = 0;
    std::uint64_t layer_bytes = 0;
    std::uint64_t expected_bytes = 0;
    if (!multiply_checked(fixture.width, fixture.width, elements_per_layer)
        || !multiply_checked(elements_per_layer, sizeof(float), layer_bytes)
        || !multiply_checked(fixture.layer_count, layer_bytes, expected_bytes)) {
        return RuntimeEntryResult::InvalidArgument;
    }

    std::uint64_t actual_bytes = 0;
    if (!file_size_bytes(fixture.weights_path, actual_bytes) || actual_bytes != expected_bytes) {
        return RuntimeEntryResult::LoadFailed;
    }

    impl_->release_runtime_resources();
    impl_->fixture = fixture;
    impl_->layer_bytes = layer_bytes;
    impl_->file_bytes = actual_bytes;
    impl_->budget_request = {};
    impl_->budget_plan = {};
    impl_->workspace_requirements = {};
    impl_->telemetry = {};
    impl_->telemetry.state = RuntimeLifecycle::Loaded;
    impl_->telemetry.mapped_weight_bytes = actual_bytes;
    return RuntimeEntryResult::Ok;
}

RuntimeEntryResult RuntimeEntry::admit(const RuntimeBudgetRequest & request) {
    if (impl_ == nullptr || impl_->telemetry.state != RuntimeLifecycle::Loaded) {
        return RuntimeEntryResult::InvalidState;
    }
    if (request.device_memory_requested_bytes != 0) {
        return RuntimeEntryResult::InvalidArgument;
    }

    RuntimeBudgetPlan budget_plan;
    const auto budget_result = plan_runtime_budget(request, budget_plan);
    if (budget_result == RuntimeBudgetResult::InvalidArgument || budget_result == RuntimeBudgetResult::Overflow) {
        return RuntimeEntryResult::InvalidArgument;
    }
    if (budget_result != RuntimeBudgetResult::Ok) {
        return RuntimeEntryResult::BudgetRejected;
    }

    RuntimeWorkspaceRequirements workspace_requirements;
    const auto workspace_result = plan_cpu_dense_workspace(impl_->fixture.width, workspace_requirements);
    if (workspace_result == RuntimeWorkspaceResult::InvalidArgument ||
        workspace_result == RuntimeWorkspaceResult::Overflow) {
        return RuntimeEntryResult::InvalidArgument;
    }
    if (workspace_result != RuntimeWorkspaceResult::Ok) {
        return RuntimeEntryResult::ComputeError;
    }
    if (!runtime_workspace_fits_budget(
            request.runtime_overhead_bytes,
            request.compute_scratch_bytes,
            workspace_requirements)) {
        return RuntimeEntryResult::BudgetRejected;
    }

    try {

        auto ledger = std::make_unique<MemoryLedger>(request.host_ceiling_bytes);
        if (!reserve_fixed_ownership(*ledger, request)) {
            return RuntimeEntryResult::BudgetRejected;
        }

        auto residency = std::make_unique<FileResidency>(impl_->fixture.weights_path, *ledger);
        if (residency->size_bytes() != impl_->file_bytes || residency->page_size() == 0
            || impl_->layer_bytes % residency->page_size() != 0) {
            return RuntimeEntryResult::LoadFailed;
        }

        std::vector<DenseLayerRange> layers;
        layers.reserve(static_cast<std::size_t>(impl_->fixture.layer_count));
        for (std::uint64_t layer = 0; layer < impl_->fixture.layer_count; ++layer) {
            std::uint64_t offset = 0;
            if (!multiply_checked(layer, impl_->layer_bytes, offset)) {
                return RuntimeEntryResult::InvalidArgument;
            }
            layers.push_back(DenseLayerRange{offset, impl_->layer_bytes});
        }

        DenseResidencyPlan dense_plan;
        const auto dense_result = plan_dense_residency(
            layers,
            residency->page_size(),
            budget_plan.dense_residency_bytes,
            dense_plan,
            DenseTraversal::Finite);

        if (dense_result == DensePlanResult::BudgetTooSmall) {
            return RuntimeEntryResult::BudgetRejected;
        }
        if (dense_result != DensePlanResult::Ok) {
            return RuntimeEntryResult::InvalidArgument;
        }

        auto dense_policy = std::make_unique<DenseResidencyPolicy>(*residency, dense_plan);
        ggml_backend_t backend = ggml_backend_cpu_init();
        if (backend == nullptr || !ggml_backend_is_cpu(backend)) {
            if (backend != nullptr) {
                ggml_backend_free(backend);
            }
            return RuntimeEntryResult::ComputeError;
        }
        ggml_backend_cpu_set_n_threads(backend, 1);

        impl_->budget_request = request;
        impl_->budget_plan = budget_plan;
        impl_->workspace_requirements = workspace_requirements;
        impl_->ledger = std::move(ledger);

        impl_->residency = std::move(residency);
        impl_->dense_policy = std::move(dense_policy);
        impl_->backend = backend;

        impl_->telemetry.host_ceiling_bytes = budget_plan.host_ceiling_bytes;
        impl_->telemetry.planned_host_bytes = budget_plan.host_planned_bytes;
        impl_->telemetry.ggml_metadata_required_bytes = workspace_requirements.metadata_bytes;
        impl_->telemetry.ggml_compute_required_bytes = workspace_requirements.compute_buffer_bytes;

        impl_->telemetry.dense_pinned_prefix_count = dense_plan.pinned_prefix_count;
        impl_->telemetry.dense_ring_slots = dense_plan.ring_slots;
        impl_->telemetry.completed_layers = 0;
        impl_->telemetry.ready_before_compute_count = 0;
        impl_->telemetry.output.clear();
        impl_->telemetry.peak_owned_bytes = 0;
        impl_->telemetry.state = RuntimeLifecycle::Admitted;
        impl_->update_memory_telemetry();
        return RuntimeEntryResult::Ok;
    } catch (...) {
        return RuntimeEntryResult::LoadFailed;
    }
}

RuntimeEntryResult RuntimeEntry::execute(
        const std::vector<float> & input,
        const RuntimeCancellationCheck & cancellation_check) {
    if (impl_ == nullptr || impl_->telemetry.state != RuntimeLifecycle::Admitted
        || impl_->ledger == nullptr || impl_->residency == nullptr
        || impl_->dense_policy == nullptr || impl_->backend == nullptr) {
        return RuntimeEntryResult::InvalidState;
    }
    if (input.size() != impl_->fixture.width) {
        return RuntimeEntryResult::InvalidArgument;
    }

    impl_->telemetry.state = RuntimeLifecycle::Running;
    impl_->telemetry.completed_layers = 0;
    impl_->telemetry.ready_before_compute_count = 0;
    impl_->telemetry.output.clear();
    impl_->update_memory_telemetry();

    if (impl_->dense_policy->start() != DenseResidencyResult::Ok) {
        impl_->telemetry.state = RuntimeLifecycle::Failed;
        impl_->update_memory_telemetry();
        return RuntimeEntryResult::ResidencyError;
    }
    impl_->update_memory_telemetry();

    std::vector<float> state = input;
    for (std::uint64_t layer = 0; layer < impl_->fixture.layer_count; ++layer) {
        if (cancellation_check) {
            bool cancelled = false;
            try {
                cancelled = cancellation_check();
            } catch (...) {
                (void)impl_->dense_policy->stop();
                impl_->telemetry.state = RuntimeLifecycle::Failed;
                impl_->update_memory_telemetry();
                return RuntimeEntryResult::ComputeError;
            }
            if (cancelled) {
                return impl_->cancel_at_safe_point(state);
            }
        }

        if (impl_->dense_policy->prepare(layer) != DenseResidencyResult::Ok) {
            (void)impl_->dense_policy->stop();
            impl_->telemetry.state = RuntimeLifecycle::Failed;
            impl_->update_memory_telemetry();
            return RuntimeEntryResult::ResidencyError;
        }
        impl_->telemetry.ready_before_compute_count += 1;
        impl_->update_memory_telemetry();

        const auto & layer_range = impl_->dense_policy->plan().layers[static_cast<std::size_t>(layer)];
        const void * const active_data = impl_->dense_policy->active_data();
        if (active_data == nullptr ||
            (reinterpret_cast<std::uintptr_t>(active_data) % alignof(float)) != 0) {
            return impl_->fail_after_prepare(layer, RuntimeEntryResult::ResidencyError);
        }
        const auto * weights = static_cast<const float *>(active_data);


        std::vector<float> output;

        if (!run_dense_layer(
                impl_->backend,
                weights,
                layer_range.length,
                state,
                impl_->fixture.width,
                impl_->workspace_requirements,
                output)) {

            return impl_->fail_after_prepare(layer, RuntimeEntryResult::ComputeError);
        }

        if (impl_->dense_policy->complete(layer) != DenseResidencyResult::Ok) {
            impl_->telemetry.state = RuntimeLifecycle::Failed;
            impl_->update_memory_telemetry();
            return RuntimeEntryResult::ResidencyError;
        }
        state = std::move(output);
        impl_->telemetry.completed_layers += 1;
        impl_->update_memory_telemetry();
    }

    if (impl_->dense_policy->stop() != DenseResidencyResult::Ok) {
        impl_->telemetry.state = RuntimeLifecycle::Failed;
        impl_->update_memory_telemetry();
        return RuntimeEntryResult::ResidencyError;
    }

    impl_->telemetry.output = std::move(state);
    impl_->telemetry.state = RuntimeLifecycle::Completed;
    impl_->update_memory_telemetry();
    return RuntimeEntryResult::Ok;
}

RuntimeEntryResult RuntimeEntry::unload() noexcept {
    if (impl_ == nullptr) {
        return RuntimeEntryResult::Ok;
    }
    if (impl_->telemetry.state == RuntimeLifecycle::Running) {
        return RuntimeEntryResult::InvalidState;
    }

    if (impl_->dense_policy != nullptr) {
        const auto stop_result = impl_->dense_policy->stop();
        if (stop_result == DenseResidencyResult::Busy) {
            return RuntimeEntryResult::InvalidState;
        }
        if (stop_result != DenseResidencyResult::Ok) {
            return RuntimeEntryResult::ResidencyError;
        }
    }

    impl_->release_runtime_resources();
    impl_->telemetry.state = RuntimeLifecycle::Unloaded;
    impl_->telemetry.current_owned_bytes = 0;
    impl_->telemetry.intentional_resident_bytes = 0;
    return RuntimeEntryResult::Ok;
}

const RuntimeTelemetry & RuntimeEntry::telemetry() const noexcept {
    static const RuntimeTelemetry empty{};
    return impl_ != nullptr ? impl_->telemetry : empty;
}

} // namespace super_runtime
