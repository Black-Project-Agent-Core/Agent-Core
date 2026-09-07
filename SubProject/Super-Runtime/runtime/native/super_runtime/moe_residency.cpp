#include "moe_residency.h"

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <vector>

namespace super_runtime {
namespace {

bool add_overflow(std::uint64_t a, std::uint64_t b, std::uint64_t & out) noexcept {
    if (b > std::numeric_limits<std::uint64_t>::max() - a) {
        return true;
    }
    out = a + b;
    return false;
}

bool mul_overflow(std::uint64_t a, std::uint64_t b, std::uint64_t & out) noexcept {
    if (a != 0 && b > std::numeric_limits<std::uint64_t>::max() / a) {
        return true;
    }
    out = a * b;
    return false;
}

bool align_down(std::uint64_t value, std::uint64_t alignment, std::uint64_t & out) noexcept {
    if (alignment == 0) {
        return false;
    }
    out = value - (value % alignment);
    return true;
}

bool align_up(std::uint64_t value, std::uint64_t alignment, std::uint64_t & out) noexcept {
    if (alignment == 0) {
        return false;
    }
    const std::uint64_t remainder = value % alignment;
    if (remainder == 0) {
        out = value;
        return true;
    }
    return !add_overflow(value, alignment - remainder, out);
}

} // namespace

MoePlanResult plan_moe_residency(
        const StridedExpertIds & ids,
        const MoeExpertLayout & layout,
        std::vector<ByteRange> & ranges) {
    ranges.clear();

    if (ids.data == nullptr || ids.experts_per_token == 0 || ids.token_count == 0 ||
        ids.expert_stride_bytes < sizeof(std::int32_t) || ids.token_stride_bytes < sizeof(std::int32_t) ||
        layout.expert_count == 0 || layout.expert_stride == 0 || layout.mapping_size == 0 ||
        layout.residency_alignment == 0) {
        return MoePlanResult::InvalidArgument;
    }

    std::uint64_t minimum_row_span = 0;
    if (mul_overflow(ids.experts_per_token - 1, ids.expert_stride_bytes, minimum_row_span) ||
        add_overflow(minimum_row_span, sizeof(std::int32_t), minimum_row_span)) {
        return MoePlanResult::Overflow;
    }
    if (ids.token_stride_bytes < minimum_row_span) {
        return MoePlanResult::InvalidArgument;
    }

    std::uint64_t final_token_offset = 0;
    std::uint64_t final_slot_offset = 0;
    std::uint64_t required_data_bytes = 0;
    if (mul_overflow(ids.token_count - 1, ids.token_stride_bytes, final_token_offset) ||
        mul_overflow(ids.experts_per_token - 1, ids.expert_stride_bytes, final_slot_offset) ||
        add_overflow(final_token_offset, final_slot_offset, required_data_bytes) ||
        add_overflow(required_data_bytes, sizeof(std::int32_t), required_data_bytes)) {
        return MoePlanResult::Overflow;
    }
    if (required_data_bytes > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        return MoePlanResult::Overflow;
    }
    if (ids.data_bytes < required_data_bytes) {
        return MoePlanResult::InvalidArgument;
    }

    std::uint64_t tensor_span = 0;

    if (mul_overflow(layout.expert_count, layout.expert_stride, tensor_span)) {
        return MoePlanResult::Overflow;
    }
    std::uint64_t tensor_end = 0;
    if (add_overflow(layout.tensor_offset, tensor_span, tensor_end)) {
        return MoePlanResult::Overflow;
    }
    if (tensor_end > layout.mapping_size) {
        return MoePlanResult::InvalidArgument;
    }

    std::vector<std::uint8_t> selected(static_cast<std::size_t>(layout.expert_count), 0);
    const auto * base = static_cast<const std::uint8_t *>(ids.data);

    for (std::uint64_t token = 0; token < ids.token_count; ++token) {
        std::uint64_t token_offset = 0;
        if (mul_overflow(token, ids.token_stride_bytes, token_offset)) {
            return MoePlanResult::Overflow;
        }

        for (std::uint64_t slot = 0; slot < ids.experts_per_token; ++slot) {
            std::uint64_t slot_offset = 0;
            if (mul_overflow(slot, ids.expert_stride_bytes, slot_offset)) {
                return MoePlanResult::Overflow;
            }
            std::uint64_t byte_offset = 0;
            if (add_overflow(token_offset, slot_offset, byte_offset) ||
                byte_offset > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
                return MoePlanResult::Overflow;
            }

            std::int32_t id = -1;
            std::memcpy(&id, base + static_cast<std::size_t>(byte_offset), sizeof(id));
            if (id < 0 || static_cast<std::uint64_t>(id) >= layout.expert_count) {
                ranges.clear();
                return MoePlanResult::InvalidExpertId;
            }
            selected[static_cast<std::size_t>(id)] = 1;
        }
    }

    std::vector<ByteRange> planned;
    planned.reserve(static_cast<std::size_t>(layout.expert_count));

    for (std::uint64_t id = 0; id < layout.expert_count; ++id) {
        if (selected[static_cast<std::size_t>(id)] == 0) {
            continue;
        }

        std::uint64_t expert_delta = 0;
        if (mul_overflow(id, layout.expert_stride, expert_delta)) {
            return MoePlanResult::Overflow;
        }
        std::uint64_t exact_begin = 0;
        if (add_overflow(layout.tensor_offset, expert_delta, exact_begin)) {
            return MoePlanResult::Overflow;
        }
        std::uint64_t exact_end = 0;
        if (add_overflow(exact_begin, layout.expert_stride, exact_end)) {
            return MoePlanResult::Overflow;
        }

        std::uint64_t aligned_begin = 0;
        std::uint64_t aligned_end = 0;
        if (!align_down(exact_begin, layout.residency_alignment, aligned_begin) ||
            !align_up(exact_end, layout.residency_alignment, aligned_end)) {
            return MoePlanResult::Overflow;
        }
        if (aligned_end > layout.mapping_size || aligned_end <= aligned_begin) {
            return MoePlanResult::InvalidArgument;
        }

        if (!planned.empty()) {
            auto & previous = planned.back();
            std::uint64_t previous_end = 0;
            if (add_overflow(previous.offset, previous.length, previous_end)) {
                return MoePlanResult::Overflow;
            }
            if (aligned_begin <= previous_end) {
                if (aligned_end > previous_end) {
                    previous.length = aligned_end - previous.offset;
                }
                continue;
            }
        }

        planned.push_back(ByteRange{aligned_begin, aligned_end - aligned_begin});
    }

    if (planned.empty()) {
        return MoePlanResult::InvalidArgument;
    }

    ranges = std::move(planned);
    return MoePlanResult::Ok;
}

} // namespace super_runtime
