cmake_minimum_required(VERSION 3.14...3.28)

project(super-runtime LANGUAGES C CXX)

enable_testing()

add_test(
    NAME super-runtime-pinned-source-cleanliness
    COMMAND "${CMAKE_COMMAND}"
        "-DSUPER_RUNTIME_SOURCE_DIR=${CMAKE_CURRENT_SOURCE_DIR}"
        "-DSUPER_RUNTIME_FIXTURE_DIR=${CMAKE_CURRENT_BINARY_DIR}/pinned-source-cleanliness-fixture"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/contracts/pinned-source-cleanliness.cmake"
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(
    SUPER_RUNTIME_LLAMA_SOURCE
    "${CMAKE_CURRENT_SOURCE_DIR}/research/references/llama.cpp"
    CACHE PATH
    "Path to the pinned llama.cpp source used by the Super-Runtime native substrate"
)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/runtime/native/LLAMA_CPP_REVISION" SUPER_RUNTIME_LLAMA_CPP_REVISION)
string(STRIP "${SUPER_RUNTIME_LLAMA_CPP_REVISION}" SUPER_RUNTIME_LLAMA_CPP_REVISION)

string(LENGTH "${SUPER_RUNTIME_LLAMA_CPP_REVISION}" SUPER_RUNTIME_LLAMA_CPP_REVISION_LENGTH)
if(
    NOT SUPER_RUNTIME_LLAMA_CPP_REVISION_LENGTH EQUAL 40
    OR NOT SUPER_RUNTIME_LLAMA_CPP_REVISION MATCHES "^[0-9a-f]+$"
)
    message(FATAL_ERROR "runtime/native/LLAMA_CPP_REVISION must contain one full 40-hex commit SHA")
endif()

if(NOT EXISTS "${SUPER_RUNTIME_LLAMA_SOURCE}/CMakeLists.txt")
    message(FATAL_ERROR
        "Pinned llama.cpp source is unavailable at ${SUPER_RUNTIME_LLAMA_SOURCE}. "
        "Initialize the research/references/llama.cpp submodule or set SUPER_RUNTIME_LLAMA_SOURCE."
    )
endif()

include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/SuperRuntimePinnedGitSource.cmake")
super_runtime_verify_pinned_git_source(
    SOURCE_DIR "${SUPER_RUNTIME_LLAMA_SOURCE}"
    EXPECTED_REVISION "${SUPER_RUNTIME_LLAMA_CPP_REVISION}"
)


# Task 1 freezes a CPU-only production substrate boundary. Optional accelerator
# backends are deliberately disabled until the native CPU runtime exists.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GGML_CUDA OFF CACHE BOOL "" FORCE)
set(GGML_HIP OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_METAL OFF CACHE BOOL "" FORCE)
set(GGML_SYCL OFF CACHE BOOL "" FORCE)
set(GGML_OPENCL OFF CACHE BOOL "" FORCE)

add_subdirectory(
    "${SUPER_RUNTIME_LLAMA_SOURCE}"
    "${CMAKE_BINARY_DIR}/_deps/llama.cpp"
    EXCLUDE_FROM_ALL
)

add_subdirectory(runtime/native)
