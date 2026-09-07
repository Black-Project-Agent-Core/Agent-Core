#include "super_runtime/file_residency.h"

#include <cstdlib>
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>

namespace {

template <typename T, typename = void>
struct has_data_method : std::false_type {};

template <typename T>
struct has_data_method<T, std::void_t<decltype(std::declval<const T &>().data())>> : std::true_type {};

template <typename T, typename = void>
struct has_size_bytes_method : std::false_type {};

template <typename T>
struct has_size_bytes_method<T, std::void_t<decltype(std::declval<const T &>().size_bytes())>> : std::true_type {};

[[noreturn]] void fail(const std::string & message) {
    std::cerr << "file-residency-contract test: FAIL: " << message << '\n';
    std::exit(1);
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        fail(message);
    }
}

} // namespace

int main() {
    require(!has_data_method<super_runtime::FileResidency>::value,
            "FileResidency must not expose the raw mapping pointer");
    require(has_data_method<super_runtime::FileResidencyLease>::value,
            "FileResidencyLease must expose access to its leased range");
    require(has_size_bytes_method<super_runtime::FileResidencyLease>::value,
            "FileResidencyLease must expose the leased range size");

    std::cout << "file-residency-contract tests: PASS\n";
    return 0;
}
