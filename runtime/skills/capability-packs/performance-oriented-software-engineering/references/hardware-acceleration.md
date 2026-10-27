# Hardware acceleration

Read this reference only when profiling shows a suitable data-parallel hot path and vectorization or GPU execution is a plausible option.

- **Vectorization/SIMD:** consider suitable hot data-parallel loops and existing optimized libraries/compiler support. Verify target capabilities and numerical behavior before adding architecture-specific code.
- **GPU computing:** consider supported, sufficiently large parallel workloads with adequate device memory. Include initialization, transfers, synchronization, and fallback costs in the end-to-end comparison; accelerator availability alone is not a reason to use it.
