add_library(
    super-runtime-core
    STATIC
    super_runtime/memory_ledger.cpp
)

target_include_directories(super-runtime-core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_features(super-runtime-core PUBLIC cxx_std_17)

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

if(MSVC)
    target_compile_options(super-runtime-core PRIVATE /W4)
    target_compile_options(super-runtime-native-smoke PRIVATE /W4)
    target_compile_options(super-runtime-test-memory-ledger PRIVATE /W4)
else()
    target_compile_options(super-runtime-core PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-native-smoke PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(super-runtime-test-memory-ledger PRIVATE -Wall -Wextra -Wpedantic)
endif()
