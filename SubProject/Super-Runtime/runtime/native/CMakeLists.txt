add_executable(super-runtime-native-smoke smoke.cpp)

target_link_libraries(super-runtime-native-smoke PRIVATE llama ggml)

target_compile_definitions(
    super-runtime-native-smoke
    PRIVATE SUPER_RUNTIME_LLAMA_CPP_REVISION="${SUPER_RUNTIME_LLAMA_CPP_REVISION}"
)

if(MSVC)
    target_compile_options(super-runtime-native-smoke PRIVATE /W4)
else()
    target_compile_options(super-runtime-native-smoke PRIVATE -Wall -Wextra -Wpedantic)
endif()
