#include "runtime_workspace.h"

#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml.h"

#include <cstddef>
#include <cstdint>
#include <limits>

namespace super_runtime {
namespace {

bool add_size_checked(std::size_t a, std::size_t b, std::size_t & out) noexcept {
    if (b > std::numeric_limits<std::size_t>::max() - a) {
        return false;
    }
    out = a + b;
    return true;
}

bool mul_size_checked(std::size_t a, std::size_t b, std::size_t & out) noexcept {
    if (a != 0 && b > std::numeric_limits<std::size_t>::max() / a) {
        return false;
    }
    out = a * b;
    return true;
}

} // namespace

RuntimeWorkspaceResult plan_cpu_dense_workspace(
        std::uint64_t width,
        RuntimeWorkspaceRequirements & requirements) noexcept {
    requirements = {};

    if (width == 0 || width > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max())) {
        return RuntimeWorkspaceResult::InvalidArgument;
    }

    std::size_t width_size = 0;
    if (width > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        return RuntimeWorkspaceResult::Overflow;
    }
    width_size = static_cast<std::size_t>(width);

    std::size_t weight_elements = 0;
    std::size_t weight_bytes = 0;
    if (!mul_size_checked(width_size, width_size, weight_elements) ||
        !mul_size_checked(weight_elements, sizeof(float), weight_bytes)) {
        return RuntimeWorkspaceResult::Overflow;
    }
    (void) weight_bytes;

    std::size_t tensor_metadata = 0;
    if (!mul_size_checked(3, ggml_tensor_overhead(), tensor_metadata)) {
        return RuntimeWorkspaceResult::Overflow;
    }
    std::size_t metadata_bytes = 0;
    if (!add_size_checked(
            tensor_metadata,
            ggml_graph_overhead_custom(runtime_dense_graph_size, false),
            metadata_bytes)) {
        return RuntimeWorkspaceResult::Overflow;
    }
    if (metadata_bytes == 0 ||
        metadata_bytes > static_cast<std::size_t>(std::numeric_limits<std::uint64_t>::max())) {
        return RuntimeWorkspaceResult::Overflow;
    }

    ggml_init_params params = {
        /* .mem_size   = */ metadata_bytes,
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };
    ggml_context * ctx = ggml_init(params);
    if (ctx == nullptr) {
        return RuntimeWorkspaceResult::ComputeError;
    }

    RuntimeWorkspaceResult result_code = RuntimeWorkspaceResult::ComputeError;
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
        if (weight == nullptr || x == nullptr) {
            break;
        }

        ggml_tensor * output = ggml_mul_mat(ctx, weight, x);
        if (output == nullptr) {
            break;
        }

        ggml_cgraph * graph = ggml_new_graph_custom(ctx, runtime_dense_graph_size, false);
        if (graph == nullptr) {
            break;
        }
        ggml_build_forward_expand(graph, output);

        alignas(64) static std::uint8_t weight_sentinel = 0;
        weight->data = &weight_sentinel;
        const std::size_t compute_bytes = ggml_backend_alloc_ctx_tensors_from_buft_size(
            ctx,
            ggml_backend_cpu_buffer_type());
        weight->data = nullptr;

        if (compute_bytes == 0 ||
            compute_bytes > static_cast<std::size_t>(std::numeric_limits<std::uint64_t>::max())) {
            break;
        }

        requirements.metadata_bytes = static_cast<std::uint64_t>(metadata_bytes);
        requirements.compute_buffer_bytes = static_cast<std::uint64_t>(compute_bytes);
        result_code = RuntimeWorkspaceResult::Ok;
    } while (false);

    ggml_free(ctx);
    return result_code;
}

bool runtime_workspace_fits_budget(
        std::uint64_t runtime_overhead_bytes,
        std::uint64_t compute_scratch_bytes,
        const RuntimeWorkspaceRequirements & requirements) noexcept {
    return requirements.metadata_bytes != 0 &&
        requirements.compute_buffer_bytes != 0 &&
        runtime_overhead_bytes >= requirements.metadata_bytes &&
        compute_scratch_bytes >= requirements.compute_buffer_bytes;
}

} // namespace super_runtime