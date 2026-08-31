add_library(
    super-runtime-core
    STATIC
    super_runtime/memory_ledger.cpp
    super_runtime/file_residency.cpp
    super_runtime/moe_residency.cpp
    super_runtime/dense_residency.cpp
    super_runtime/runtime_budget.cpp
    super_runtime/runtime_entry.cpp
)

target_include_directories(super-runtime-core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_features(super-runtime-core PUBLIC cxx_std_17)
target_link_libraries(super-runtime-core PUBLIC ggml)

add_executable(super-runtime-native-smoke smoke.cpp)
target_link_libraries(super-runtime-native-smoke PRIVATE llama ggml)
target_compile_definitions(
    super-runtime-native-smoke
    PRIVATE SUPER_RUNTIME_LLAMA_CPP_REVISION="${SUPER_RUNTIME_LLAMA_CPP_REVISION}"
)

find_package(Threads REQUIRED)
add_executable(super-runtime-test-memory-ledger tests/test_memory_ledger.cpp)
target_link_libraries(super-runtime-test-memory-ledger PRIVATE super-runtime-core Threads::Threads)
add_test(NAME super-runtime-memory-ledger COMMAND super-runtime-test-memory-ledger)

add_executable(super-runtime-test-moe-residency tests/test_moe_residency.cpp)
target_link_libraries(super-runtime-test-moe-residency PRIVATE super-runtime-core ggml)
add_test(NAME super-runtime-moe-residency COMMAND super-runtime-test-moe-residency)

add_executable(super-runtime-test-dense-residency tests/test_dense_residency.cpp)
target_link_libraries(super-runtime-test-dense-residency PRIVATE super-runtime-core ggml)
add_test(NAME super-runtime-dense-residency COMMAND super-runtime-test-dense-residency)

add_executable(super-runtime-test-runtime-budget tests/test_runtime_budget.cpp)
target_link_libraries(super-runtime-test-runtime-budget PRIVATE super-runtime-core)
add_test(NAME super-runtime-runtime-budget COMMAND super-runtime-test-runtime-budget)

add_executable(super-runtime-test-runtime-entry tests/test_runtime_entry.cpp)
target_link_libraries(super-runtime-test-runtime-entry PRIVATE super-runtime-core ggml)
add_test(NAME super-runtime-runtime-entry COMMAND super-runtime-test-runtime-entry)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    add_executable(super-runtime-test-file-residency tests/test_file_residency.cpp)
    target_link_libraries(super-runtime-test-file-residency PRIVATE super-runtime-core)
    add_test(NAME super-runtime-file-residency COMMAND super-runtime-test-file-residency)
endif()

if(MSVC)
    target_compile_options(super-runtime-core PRIVATE /W4)
    target_compile_options(super-runtime-native-smoke PRIVATE /W4)
    target_compile_options(super-runtime-test-memory-ledger PRIVATE /W4)
    target_compile_options(super-runtime-test-moe-residency PRIVATE /W4)
    target_compile_options(super-runtime-test-dense-residency PRIVATE /W4)
    target_compile_options(super-runtime-test-runtime-budget PRIVATE /W4)
    target_compile_options(super-runtime-test-runtime-entry PRIVATE /W4)
else()
    target_compile_options(super-runtime-core PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-native-smoke PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-memory-ledger PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-moe-residency PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-dense-residency PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-runtime-budget PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-runtime-entry PRIVATE -Wall -Wextra -Wpedantic)
    if(TARGET super-runtime-test-file-residency)
        target_compile_options(super-runtime-test-file-residency PRIVATE -Wall -Wextra -Wpedantic)
    endif()
endif()
