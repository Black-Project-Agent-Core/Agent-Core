#pragma once

#include <cstdint>
#include <vector>

namespace super_runtime {

struct ByteRange {
    std::uint64_t offset = 0;
    std::uint64_t length = 0;
};

struct StridedExpertIds {
    const void * data = nullptr;
    std::uint64_t experts_per_token = 0;
    std::uint64_t token_count = 0;
    std::uint64_t expert_stride_bytes = 0;
    std::uint64_t token_stride_bytes = 0;
    std::uint64_t data_bytes = 0;
};

struct MoeExpertLayout {
    std::uint64_t expert_count = 0;
    std::uint64_t tensor_offset = 0;
    std::uint64_t expert_stride = 0;
    std::uint64_t mapping_size = 0;
    std::uint64_t residency_alignment = 0;
};

enum class MoePlanResult : std::uint8_t {
    Ok = 0,
    InvalidArgument,
    InvalidExpertId,
    Overflow,
};

[[nodiscard]] MoePlanResult plan_moe_residency(
    const StridedExpertIds & ids,
    const MoeExpertLayout & layout,
    std::vector<ByteRange> & ranges);

} // namespace super_runtime
