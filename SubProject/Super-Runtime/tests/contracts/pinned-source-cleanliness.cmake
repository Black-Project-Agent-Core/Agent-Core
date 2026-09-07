if(NOT DEFINED SUPER_RUNTIME_SOURCE_DIR)
    message(FATAL_ERROR "SUPER_RUNTIME_SOURCE_DIR is required")
endif()
if(NOT DEFINED SUPER_RUNTIME_FIXTURE_DIR)
    message(FATAL_ERROR "SUPER_RUNTIME_FIXTURE_DIR is required")
endif()

find_package(Git REQUIRED)
file(REMOVE_RECURSE "${SUPER_RUNTIME_FIXTURE_DIR}")
file(MAKE_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")

execute_process(COMMAND "${GIT_EXECUTABLE}" init RESULT_VARIABLE init_result WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}" ERROR_QUIET)
if(NOT init_result EQUAL 0)
    message(FATAL_ERROR "fixture git init failed")
endif()
execute_process(COMMAND "${GIT_EXECUTABLE}" config user.name "Super Runtime Test" WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")
execute_process(COMMAND "${GIT_EXECUTABLE}" config user.email "super-runtime-test@example.invalid" WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")
file(WRITE "${SUPER_RUNTIME_FIXTURE_DIR}/tracked.txt" "clean\n")
execute_process(COMMAND "${GIT_EXECUTABLE}" add tracked.txt RESULT_VARIABLE add_result WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")
execute_process(COMMAND "${GIT_EXECUTABLE}" commit -m initial RESULT_VARIABLE commit_result WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}" OUTPUT_QUIET ERROR_QUIET)
if(NOT add_result EQUAL 0 OR NOT commit_result EQUAL 0)
    message(FATAL_ERROR "fixture git commit failed")
endif()
execute_process(
    COMMAND "${GIT_EXECUTABLE}" rev-parse HEAD
    RESULT_VARIABLE head_result
    OUTPUT_VARIABLE fixture_head
    OUTPUT_STRIP_TRAILING_WHITESPACE
    WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}"
)
if(NOT head_result EQUAL 0)
    message(FATAL_ERROR "fixture git HEAD read failed")
endif()

set(runner "${SUPER_RUNTIME_FIXTURE_DIR}/verify.cmake")
file(WRITE "${runner}" "include(\"${SUPER_RUNTIME_SOURCE_DIR}/cmake/SuperRuntimePinnedGitSource.cmake\")\n")
file(APPEND "${runner}" "super_runtime_verify_pinned_git_source(SOURCE_DIR \"${SUPER_RUNTIME_FIXTURE_DIR}\" EXPECTED_REVISION \"${fixture_head}\")\n")

execute_process(
    COMMAND "${CMAKE_COMMAND}" -P "${runner}"
    RESULT_VARIABLE clean_result
    OUTPUT_VARIABLE clean_stdout
    ERROR_VARIABLE clean_stderr
)
if(NOT clean_result EQUAL 0)
    message(FATAL_ERROR "clean pinned source should verify, result=${clean_result}: ${clean_stderr}")
endif()

file(APPEND "${SUPER_RUNTIME_FIXTURE_DIR}/tracked.txt" "dirty\n")
execute_process(
    COMMAND "${CMAKE_COMMAND}" -P "${runner}"
    RESULT_VARIABLE dirty_result
    OUTPUT_QUIET
    ERROR_QUIET
)
if(dirty_result EQUAL 0)
    message(FATAL_ERROR "unstaged tracked changes must make pinned-source verification fail")
endif()

execute_process(COMMAND "${GIT_EXECUTABLE}" checkout -- tracked.txt WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")
file(APPEND "${SUPER_RUNTIME_FIXTURE_DIR}/tracked.txt" "staged-dirty\n")
execute_process(COMMAND "${GIT_EXECUTABLE}" add tracked.txt WORKING_DIRECTORY "${SUPER_RUNTIME_FIXTURE_DIR}")
execute_process(
    COMMAND "${CMAKE_COMMAND}" -P "${runner}"
    RESULT_VARIABLE staged_result
    OUTPUT_QUIET
    ERROR_QUIET
)
if(staged_result EQUAL 0)
    message(FATAL_ERROR "staged tracked changes must make pinned-source verification fail")
endif()

message(STATUS "pinned-source cleanliness contract: PASS")