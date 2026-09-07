include(CMakeParseArguments)

function(super_runtime_verify_pinned_git_source)
    set(options)
    set(one_value_args SOURCE_DIR EXPECTED_REVISION)
    set(multi_value_args)
    cmake_parse_arguments(SR "${options}" "${one_value_args}" "${multi_value_args}" ${ARGN})

    if(NOT SR_SOURCE_DIR OR NOT SR_EXPECTED_REVISION)
        message(FATAL_ERROR "super_runtime_verify_pinned_git_source requires SOURCE_DIR and EXPECTED_REVISION")
    endif()
    if(NOT EXISTS "${SR_SOURCE_DIR}/.git" AND NOT EXISTS "${SR_SOURCE_DIR}/CMakeLists.txt")
        message(FATAL_ERROR "Pinned git source is unavailable at ${SR_SOURCE_DIR}")
    endif()

    find_package(Git REQUIRED)
    file(TO_CMAKE_PATH "${SR_SOURCE_DIR}" SR_SAFE_SOURCE_DIR)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" -c "safe.directory=${SR_SAFE_SOURCE_DIR}" -C "${SR_SOURCE_DIR}" rev-parse HEAD
        RESULT_VARIABLE head_result
        OUTPUT_VARIABLE actual_revision
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
    )
    if(NOT head_result EQUAL 0)
        message(FATAL_ERROR "Unable to read pinned git source revision from ${SR_SOURCE_DIR}")
    endif()
    if(NOT actual_revision STREQUAL SR_EXPECTED_REVISION)
        message(FATAL_ERROR
            "Pinned source revision mismatch at ${SR_SOURCE_DIR}: expected ${SR_EXPECTED_REVISION}, got ${actual_revision}")
    endif()

    execute_process(
        COMMAND "${GIT_EXECUTABLE}" -c "safe.directory=${SR_SAFE_SOURCE_DIR}" -C "${SR_SOURCE_DIR}" diff --quiet --
        RESULT_VARIABLE unstaged_result
        ERROR_QUIET
    )
    if(unstaged_result EQUAL 1)
        message(FATAL_ERROR "Pinned source has unstaged tracked changes: ${SR_SOURCE_DIR}")
    elseif(NOT unstaged_result EQUAL 0)
        message(FATAL_ERROR "Unable to verify unstaged pinned-source cleanliness: ${SR_SOURCE_DIR}")
    endif()

    execute_process(
        COMMAND "${GIT_EXECUTABLE}" -c "safe.directory=${SR_SAFE_SOURCE_DIR}" -C "${SR_SOURCE_DIR}" diff --cached --quiet --
        RESULT_VARIABLE staged_result
        ERROR_QUIET
    )
    if(staged_result EQUAL 1)
        message(FATAL_ERROR "Pinned source has staged tracked changes: ${SR_SOURCE_DIR}")
    elseif(NOT staged_result EQUAL 0)
        message(FATAL_ERROR "Unable to verify staged pinned-source cleanliness: ${SR_SOURCE_DIR}")
    endif()
endfunction()