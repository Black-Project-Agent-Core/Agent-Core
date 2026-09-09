#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "llama.h"

#include <cstdio>

#ifndef SUPER_RUNTIME_LLAMA_CPP_REVISION
#error "SUPER_RUNTIME_LLAMA_CPP_REVISION must be defined by the native substrate build"
#endif

int main() {
    llama_backend_init();

    ggml_backend_t cpu = ggml_backend_cpu_init();
    if (cpu == nullptr || !ggml_backend_is_cpu(cpu)) {
        if (cpu != nullptr) {
            ggml_backend_free(cpu);
        }
        llama_backend_free();
        std::fprintf(stderr, "super-runtime-native-smoke: CPU backend initialization failed\n");
        return 1;
    }

    const char * version = llama_version();
    if (version == nullptr || version[0] == '\0') {
        ggml_backend_free(cpu);
        llama_backend_free();
        std::fprintf(stderr, "super-runtime-native-smoke: llama version unavailable\n");
        return 2;
    }

    std::printf("super-runtime-native-smoke: PASS\n");
    std::printf("llama.cpp revision: %s\n", SUPER_RUNTIME_LLAMA_CPP_REVISION);
    std::printf("llama version: %s\n", version);
    std::printf("backend: CPU\n");

    ggml_backend_free(cpu);
    llama_backend_free();
    return 0;
}
