import { getSystemInfo, getOSSpecificGuidance, getPathGuidance } from '../rdc/utils/system-info.js';

const SYSTEM_INFO = getSystemInfo();
const OS_GUIDANCE = getOSSpecificGuidance(SYSTEM_INFO);
const PATH_GUIDANCE = `IMPORTANT: ${getPathGuidance(SYSTEM_INFO)} Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.`;
const CMD_PREFIX_DESCRIPTION = `This command can be referenced as \"DC: ...\" or \"use Desktop Commander to ...\" in your instructions.`;

export const RDC_TOOL_METADATA = {
  image_inspect: {
    title: 'Inspect Local Image',
    description: `External controllers only. Local regular 8-bit PNG/JPEG/WebP under existing path permissions; no URL, animated or vector files. Use absolute paths, not ~.
overview returns oriented image/viewId; optional sourceFiles=[1..8 absolute local UTF-8 text paths] captures a declared dependency baseline (2MiB each). crop inherits the baseline; review rechecks it. current/changed/unavailable applies only to declared files, not verified render derivation or full dependency closure.
crop uses viewId and displayed-pixel rectangle {x,y,width,height}, top-left origin, right/bottom exclusive; every crop reads original pixels. zoom 1-16 adds no detail.
review binds caller-supplied criteria[].assessment to live source/view digests; it never judges pixels, verifies claims, or approves exports. Missing assessments stay unknown; pass/fail require evidenceViewIds. Max 16 criteria/8 unique views; review input 24KiB/output 32KiB.
Views expire after 15 minutes or source change, scoped to credential and session header. Headerless clients sharing credentials share a view namespace. Re-observe on expired/foreign/evicted views.
Input 32MiB/24M pixels. Image output max 1536 edge/1.5M pixels/2MiB encoded/3MiB result; PNG default, JPEG lossy, maxEdge 128-1536. Oversize: lower maxEdge or crop. Images and reviews never spill; capture metadata only, stricter workspace omission applies.`,
    annotations: { title: 'Inspect Local Image', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  get_config: {
    title: 'Get Configuration',
    description: `
                        Get the complete server configuration as JSON. Config includes fields for:
                        - blockedCommands (array of blocked shell commands)
                        - defaultShell (shell to use for commands)
                        - allowedDirectories (paths the server can access)
                        - fileReadLineLimit (max lines for read_file, default 1000)
                        - fileWriteLineLimit (max lines per write_file call, default 50)
                        - telemetryEnabled (boolean for telemetry opt-in/out)
                        - currentClient (information about the currently connected MCP client)
                        - clientHistory (history of all clients that have connected)
                        - version (version of the DesktopCommander)
                        - systemInfo (operating system and environment details)
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get Configuration', readOnlyHint: true },
  },
  set_config_value: {
    title: 'Set Configuration Value',
    description: `
                        Set a specific configuration value by key.
                        
                        WARNING: Should be used in a separate chat from file operations and 
                        command execution to prevent security issues.
                        
                        Config keys include:
                        - blockedCommands (array)
                        - defaultShell (string)
                        - allowedDirectories (array of paths)
                        - fileReadLineLimit (number, max lines for read_file)
                        - fileWriteLineLimit (number, max lines per write_file call)
                        - telemetryEnabled (boolean)
                        
                        IMPORTANT: Setting allowedDirectories to an empty array ([]) allows full access 
                        to the entire file system, regardless of the operating system.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Set Configuration Value', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  read_file: {
    title: 'Read File or URL',
    description: `
                        Read contents from files and URLs.
                        Read PDF files and extract content as markdown and images.
                        
                        Prefer this over using start_process with cat/type for viewing files.
                        
                        Supports partial file reading with:
                        - 'offset' (start line, default: 0)
                          * Positive: Start from line N (0-based indexing)
                          * Negative: Read last N lines from end (tail behavior)
                        - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting, initially 1000)
                          * Used with positive offsets for range reading
                          * Ignored when offset is negative (reads all requested tail lines)
                        
                        Examples:
                        - offset: 0, length: 10     → First 10 lines
                        - offset: 100, length: 5    → Lines 100-104
                        - offset: -20               → Last 20 lines  
                        - offset: -5, length: 10    → Last 5 lines (length ignored)
                        
                        Performance optimizations:
                        - Large files with negative offsets use reverse reading for efficiency
                        - Large files with deep positive offsets use byte estimation
                        - Small files use fast readline streaming
                        
                        When reading from the file system, only works within allowed directories.
                        Can fetch content from URLs when isUrl parameter is set to true
                        (URLs are always read in full regardless of offset/length).
                        
                        SEMANTIC DOCUMENT PROJECTION:
                        - New binary knowledge formats are projected to bounded Markdown automatically:
                          * PPTX: slide order, grouped text, tables, chart values, notes, alt text, SVG-only pictures
                          * EPUB: package metadata + spine-order content
                          * IPYNB: markdown/code/raw cells without executing code or returning notebook outputs
                          * Outlook MSG: sender/recipient/subject/body with codepage-aware text decoding
                          * ZIP: bounded recursive member projection with traversal/encryption/symlink/compression-bomb guards
                        - For formats that already have a strong native/editable reader, pass
                          options: { projection: "markdown" } to request a semantic Markdown view.
                          Supported explicit views include HTML/XHTML, RSS/Atom, CSV/legacy charsets,
                          DOCX, XLS/XLSX/XLSM, and PDF. Use options: { projection: "native" } to force
                          the existing native reader. Default "auto" preserves existing native behavior
                          except for the new automatically projected binary knowledge formats above.

                        FORMAT HANDLING (by extension):
                        - Text: Uses offset/length for line-based pagination
                        - Excel (.xlsx, .xls, .xlsm): Returns JSON 2D array by default
                          * sheet: "Sheet1" (name) or "0" (index as string, 0-based)
                          * range: ALWAYS use FROM:TO format (e.g., "A1:D100", "C1:C1", "B2:B50")
                          * offset/length work as row pagination (optional fallback)
                        - Images (PNG, JPEG, GIF, WebP): Base64 encoded viewable content
                        - PDF: Extracts text content as markdown with page structure
                          * offset/length work as page pagination (0-based)
                          * Includes embedded images when available
                        - DOCX (.docx): Two modes depending on parameters:
                          * DEFAULT (no offset/length): Returns a text-bearing outline — shows paragraphs with text,
                            tables with cell content, styles, image refs. Skips shapes/drawings/SVG noise.
                            Each element shows its body index [0], [1], etc.
                          * WITH offset/length: Returns raw pretty-printed XML with line pagination.
                            Use this to drill into specific sections or see the actual XML for editing.
                          * EDITING WORKFLOW: 1) read_file to get outline, 2) read_file with offset/length
                            to see raw XML around what you want to edit, 3) edit_block with old_string/new_string
                            using XML fragments copied from the read output.
                          * IMPORTANT: offset MUST be non-zero to get raw XML (use offset=1 to start from line 1).
                            offset=0 always returns the outline regardless of length.
                          * For BULK changes (translation, mass replacements): use start_process with Python
                            zipfile module to find/replace all <w:t> elements at once.

                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Read File or URL', readOnlyHint: true, openWorldHint: true },
  },
  read_multiple_files: {
    title: 'Read Multiple Files',
    description: `
                        Read the contents of multiple files simultaneously.
                        
                        Each file's content is returned with its path as a reference.
                        Handles text files normally and renders images as viewable content.
                        Recognized image types: PNG, JPEG, GIF, WebP.
                        
                        Failed reads for individual files won't stop the entire operation.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Read Multiple Files', readOnlyHint: true },
  },
  write_file: {
    title: 'Write File',
    description: `
                        Write or append to file contents.
                        autoCheckpoint defaults false: best-effort pre-mutation snapshot, not a mandatory backup. Capture failure never cancels an authorized write.

                        IMPORTANT: DO NOT use this tool to create PDF files. Use 'write_pdf' for all PDF creation tasks.
                        DO NOT use this tool to edit DOCX files. Use 'edit_block' with old_string/new_string instead.
                        To CREATE a new DOCX, use write_file with .docx extension — text content with markdown headings (#, ##, ###) is converted to styled DOCX paragraphs.

                        CHUNKING IS STANDARD PRACTICE: Always write files in chunks of 25-30 lines maximum.
                        This is the normal, recommended way to write files - not an emergency measure.

                        STANDARD PROCESS FOR ANY FILE:
                        1. FIRST → write_file(filePath, firstChunk, {mode: 'rewrite'})  [≤30 lines]
                        2. THEN → write_file(filePath, secondChunk, {mode: 'append'})   [≤30 lines]
                        3. CONTINUE → write_file(filePath, nextChunk, {mode: 'append'}) [≤30 lines]

                        ALWAYS CHUNK PROACTIVELY - don't wait for performance warnings!

                        WHEN TO CHUNK (always be proactive):
                        1. Any file expected to be longer than 25-30 lines
                        2. When writing multiple files in sequence
                        3. When creating documentation, code files, or configuration files

                        HANDLING CONTINUATION ("Continue" prompts):
                        If user asks to "Continue" after an incomplete operation:
                        1. Read the file to see what was successfully written
                        2. Continue writing ONLY the remaining content using {mode: 'append'}
                        3. Keep chunks to 25-30 lines each

                        FORMAT HANDLING (by extension):
                        - Text files: String content
                        - Excel (.xlsx, .xls, .xlsm): JSON 2D array or {"SheetName": [[...]]}
                          Example: '[["Name","Age"],["Alice",30]]'

                        Files over 50 lines will generate performance notes but are still written successfully.
                        Only works within allowed directories.

                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Write File', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  write_pdf: {
    title: 'Write/Modify PDF',
    description: `
                        Create a new PDF file or modify an existing one.

                        THIS IS THE ONLY TOOL FOR CREATING AND MODIFYING PDF FILES.

                        RULES ABOUT FILENAMES:
                        - When creating a new PDF, 'outputPath' MUST be provided and MUST use a new unique filename (e.g., "result_01.pdf", "analysis_2025_01.pdf", etc.).

                        MODES:
                        1. CREATE NEW PDF:
                           - Pass a markdown string as 'content'.
                           write_pdf(path="doc.pdf", content="# Title\\n\\nBody text...")

                        2. MODIFY EXISTING PDF:
                           - Pass array of operations as 'content'.
                           - NEVER overwrite the original file.
                           - ALWAYS provide a new filename in 'outputPath'.
                           - After modifying, show original file path and new file path to user.

                           write_pdf(path="doc.pdf", content=[
                               { type: "delete", pageIndexes: [0, 2] },
                               { type: "insert", pageIndex: 1, markdown: "# New Page" }
                           ])

                        OPERATIONS:
                        - delete: Remove pages by 0-based index.
                          { type: "delete", pageIndexes: [0, 1, 5] }

                        - insert: Add pages at a specific 0-based index.
                          { type: "insert", pageIndex: 0, markdown: "..." }
                          { type: "insert", pageIndex: 5, sourcePdfPath: "/path/to/source.pdf" }

                        PAGE BREAKS:
                        To force a page break, use this HTML element:
                        <div style="page-break-before: always;"></div>
                        
                        Example:
                        "# Page 1\\n\\n<div style=\\"page-break-before: always;\\"></div>\\n\\n# Page 2"

                        ADVANCED STYLING:
                        HTML/CSS and inline SVG are supported for:
                        - Text styling: colors, sizes, alignment, highlights
                        - Boxes: borders, backgrounds, padding, rounded corners
                        - SVG graphics: charts, diagrams, icons, shapes
                        - Images: <img src="/absolute/path/image.jpg" width="300" /> or ![alt](/path/image.jpg)

                        Supports standard markdown features including headers, lists, code blocks, tables, and basic formatting.

                        Only works within allowed directories.

                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Write/Modify PDF', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  create_directory: {
    title: 'Create Directory',
    description: `
                        Create a new directory or ensure a directory exists.
                        
                        Can create multiple nested directories in one operation.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Create Directory', readOnlyHint: false, destructiveHint: false },
  },
  list_directory: {
    title: 'List Directory Contents',
    description: `
                        Get a detailed listing of all files and directories in a specified path.
                        
                        Use this instead of using start_process with ls/dir commands.
                        Results distinguish between files and directories with [FILE] and [DIR] prefixes.
                        
                        Supports recursive listing with the 'depth' parameter (default: 2):
                        - depth=1: Only direct contents of the directory
                        - depth=2: Contents plus one level of subdirectories
                        - depth=3+: Multiple levels deep
                        
                        CONTEXT OVERFLOW PROTECTION:
                        - Top-level directory shows ALL items
                        - Nested directories are limited to 100 items maximum per directory
                        - When a nested directory has more than 100 items, you'll see a warning like:
                          [WARNING] node_modules: 500 items hidden (showing first 100 of 600 total)
                        - This prevents overwhelming the context with large directories like node_modules
                        
                        Results show full relative paths from the root directory being listed.
                        Example output with depth=2:
                        [DIR] src
                        [FILE] src/index.ts
                        [DIR] src/tools
                        [FILE] src/tools/filesystem.ts
                        
                        If a directory cannot be accessed, it will show [DENIED] instead.
                        If a path does not exist, it will show [NOT_FOUND] instead.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'List Directory Contents', readOnlyHint: true },
  },
  move_file: {
    title: 'Move/Rename File',
    description: `
                        Move or rename files and directories.
                        autoCheckpoint defaults false and snapshots regular-file source/destination only, best-effort. Directory moves are not covered; capture failure does not cancel an authorized move.
                        
                        Can move files between directories and rename them in a single operation.
                        Both source and destination must be within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Move/Rename File', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  file_checkpoint: {
    title: 'File Checkpoint',
    description: `
                        Create and inspect explicit project-local file checkpoints, preview a restore, restore only after
                        presenting the exact preview digest, or drop a leaf checkpoint. Checkpoints use content-addressed
                        blobs and preserve branch history without touching Git. Protected reference paths are refused.
                        Restore never runs commands, restarts services, or mutates Git automatically. Use preview_restore
                        immediately before restore; stale source state invalidates the preview digest.
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'File Checkpoint', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  start_search: {
    title: 'Start Search',
    description: `
                        Start a progressive filesystem search and return a session ID.
                        Use searchType="files" for names/extensions (for example package.json or *.ts).
                        Use searchType="content" for text, symbols, logic, TODOs, imports, or code behavior.
                        For ambiguous requests, run one files search and one content search and combine them.
                        Patterns are regular expressions by default; use literalSearch=true for exact code,
                        paths, or patterns containing regex metacharacters. filePattern narrows file types;
                        ignoreCase defaults true. Use get_more_search_results for pagination/progress and
                        stop_search when enough evidence has been collected.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Start Search', readOnlyHint: true },
  },
  get_more_search_results: {
    title: 'Get Search Results',
    description: `
                        Get more results from an active search with offset-based pagination.
                        
                        Supports partial result reading with:
                        - 'offset' (start result index, default: 0)
                          * Positive: Start from result N (0-based indexing)
                          * Negative: Read last N results from end (tail behavior)
                        - 'length' (max results to read, default: 100)
                          * Used with positive offsets for range reading
                          * Ignored when offset is negative (reads all requested tail results)
                        
                        Examples:
                        - offset: 0, length: 100     → First 100 results
                        - offset: 200, length: 50    → Results 200-249
                        - offset: -20                → Last 20 results
                        - offset: -5, length: 10     → Last 5 results (length ignored)
                        
                        Returns only results in the specified range, along with search status.
                        Works like read_process_output - call this repeatedly to get progressive
                        results from a search started with start_search.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get Search Results', readOnlyHint: true },
  },
  stop_search: {
    title: 'Stop Search',
    description: `
                        Stop an active search.
                        
                        Stops the background search process gracefully. Use this when you've found
                        what you need or if a search is taking too long. Similar to force_terminate
                        for terminal processes.
                        
                        The search will still be available for reading final results until it's
                        automatically cleaned up after 5 minutes.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Stop Search', readOnlyHint: false, destructiveHint: false },
  },
  list_searches: {
    title: 'List Active Searches',
    description: `
                        List all active searches.
                        
                        Shows search IDs, search types, patterns, status, and runtime.
                        Similar to list_sessions for terminal processes. Useful for managing
                        multiple concurrent searches.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'List Active Searches', readOnlyHint: true },
  },
  get_file_info: {
    title: 'Get File Information',
    description: `
                        Retrieve detailed metadata about a file or directory including:
                        - size
                        - creation time
                        - last modified time
                        - permissions
                        - type
                        - lineCount (for text files)
                        - lastLine (zero-indexed number of last line, for text files)
                        - appendPosition (line number for appending, for text files)
                        - sheets (for Excel files - array of {name, rowCount, colCount})

                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get File Information', readOnlyHint: true },
  },
  edit_block: {
    title: 'Edit Block',
    description: `
                        Apply surgical edits to files.
                        autoCheckpoint defaults false: best-effort snapshot before accepted exact text replacement only. Fuzzy, no-op and structured/range edits are not captured; capture failure does not cancel an authorized edit.

                        BEST PRACTICE: Make multiple small, focused edits rather than one large edit.
                        Each edit_block call should change only what needs to be changed - include just enough
                        context to uniquely identify the text being modified.

                        FORMAT HANDLING (by extension):

                        EXCEL FILES (.xlsx, .xls, .xlsm) - Range Update mode:
                        Takes:
                        - file_path: Path to the Excel file
                        - range: ALWAYS use FROM:TO format - "SheetName!A1:C10" or "SheetName!C1:C1"
                        - content: 2D array, e.g., [["H1","H2"],["R1","R2"]]

                        TEXT FILES - Find/Replace mode:
                        Takes:
                        - file_path: Path to the file to edit
                        - old_string: Text to replace
                        - new_string: Replacement text
                        - expected_replacements: Optional number of replacements (default: 1)

                        DOCX FILES (.docx) - XML Find/Replace mode:
                        Takes same parameters as text files (old_string, new_string, expected_replacements).
                        Operates on the pretty-printed XML inside the DOCX — the same XML you see from
                        read_file with offset/length. Copy XML fragments from read output as old_string.
                        After editing, the XML is repacked into a valid DOCX.
                        Also searches headers/footers if not found in document body.
                        Examples:
                        - Replace text: old_string="<w:t>Old Text</w:t>" new_string="<w:t>New Text</w:t>"
                        - Change style: old_string='<w:pStyle w:val="Normal"/>' new_string='<w:pStyle w:val="Heading1"/>'
                        - Add content: include surrounding XML context in old_string, add new elements in new_string

                        By default, replaces only ONE occurrence of the search text.
                        To replace multiple occurrences, provide expected_replacements with
                        the exact number of matches expected.

                        UNIQUENESS REQUIREMENT: When expected_replacements=1 (default), include the minimal
                        amount of context necessary (typically 1-3 lines) before and after the change point,
                        with exact whitespace and indentation.

                        When editing multiple sections, make separate edit_block calls for each distinct change
                        rather than one large replacement.

                        When a close but non-exact match is found, a character-level diff is shown in the format:
                        common_prefix{-removed-}{+added+}common_suffix to help you identify what's different.

                        Similar to write_file, there is a configurable line limit (fileWriteLineLimit) that warns
                        if the edited file exceeds this limit. If this happens, consider breaking your edits into
                        smaller, more focused changes.

                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Edit Block', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  start_process: {
    title: 'Start Terminal Process',
    description: `
                        Start a new terminal process with intelligent state detection.
                        
                        PRIMARY TOOL FOR FILE ANALYSIS AND DATA PROCESSING
                        This is the ONLY correct tool for analyzing local files (CSV, JSON, logs, etc.).
                        The analysis tool CANNOT access local files and WILL FAIL - always use processes for file-based work.
                        
                        CRITICAL RULE: For ANY local file work, ALWAYS use this tool + interact_with_process, NEVER use analysis/REPL tool.
                        
                        ${OS_GUIDANCE}
                        
                        REQUIRED WORKFLOW FOR LOCAL FILES:
                        1. start_process("python3 -i") - Start Python REPL for data analysis
                        2. interact_with_process(pid, "import pandas as pd, numpy as np")
                        3. interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
                        4. interact_with_process(pid, "print(df.describe())")
                        5. Continue analysis with pandas, matplotlib, seaborn, etc.
                        
                        COMMON FILE ANALYSIS PATTERNS:
                        • start_process("python3 -i") → Python REPL for data analysis (RECOMMENDED)
                        • start_process("node -i") → Node.js REPL for JSON processing
                        • start_process("node:local") → Node.js on MCP server (stateless, ES imports, all code in one call)
                        • start_process("cut -d',' -f1 file.csv | sort | uniq -c") → Quick CSV analysis
                        • start_process("wc -l /path/file.csv") → Line counting
                        • start_process("head -10 /path/file.csv") → File preview
                        
                        BINARY FILE SUPPORT:
                        For PDF, Excel, Word, archives, databases, and other binary formats, use process tools with appropriate libraries or command-line utilities.
                        
                        INTERACTIVE PROCESSES FOR DATA ANALYSIS:
                        For code/calculations, use in this priority order:
                        1. start_process("python3 -i") - Python REPL (preferred)
                        2. start_process("node -i") - Node.js REPL (when Python unavailable)
                        3. start_process("node:local") - Node.js fallback (when node -i fails)
                        4. Use interact_with_process() to send commands
                        5. Use read_process_output() to get responses
                        When Python is unavailable, prefer Node.js over shell for calculations.
                        Node.js: Always use ES import syntax (import x from 'y'), not require().

                        SMART DETECTION:
                        - Detects REPL prompts (>>>, >, $, etc.)
                        - Identifies when process is waiting for input
                        - Recognizes process completion vs timeout
                        - Early exit prevents unnecessary waiting
                        
                        STATES DETECTED:
                        Process waiting for input (shows prompt)
                        Process finished execution
                        Process running (use read_process_output)

                        PERFORMANCE DEBUGGING (verbose_timing parameter):
                        Set verbose_timing: true to get detailed timing information including:
                        - Exit reason (early_exit_quick_pattern, early_exit_periodic_check, process_exit, timeout)
                        - Total duration and time to first output
                        - Complete timeline of all output events with timestamps
                        - Which detection mechanism triggered early exit
                        Use this to identify missed optimization opportunities and improve detection patterns.

                        ALWAYS USE FOR: Local file analysis, CSV processing, data exploration, system commands
                        NEVER USE ANALYSIS TOOL FOR: Local file access (analysis tool is browser-only and WILL FAIL)

                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Start Terminal Process', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  read_process_output: {
    title: 'Read Process Output',
    description: `
                        Read output from a running process with file-like pagination support.
                        
                        Supports partial output reading with offset and length parameters (like read_file):
                        - 'offset' (start line, default: 0)
                          * offset=0: Read NEW output since last read (default, like old behavior)
                          * Positive: Read from absolute line position
                          * Negative: Read last N lines from end (tail behavior)
                        - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting)
                        
                        Examples:
                        - offset: 0, length: 100     → First 100 NEW lines since last read
                        - offset: 0                  → All new lines (respects config limit)
                        - offset: 500, length: 50    → Lines 500-549 (absolute position)
                        - offset: -20                → Last 20 lines (tail)
                        - offset: -50, length: 10    → Start 50 from end, read 10 lines
                        
                        OUTPUT PROTECTION:
                        - Uses same fileReadLineLimit as read_file (default: 1000 lines)
                        - Returns status like: [Reading 100 lines from line 0 (total: 5000 lines, 4900 remaining)]
                        - Prevents context overflow from verbose processes
                        
                        SMART FEATURES:
                        - For offset=0, waits up to timeout_ms for new output to arrive
                        - Detects REPL prompts and process completion
                        - Shows process state (waiting for input, finished, etc.)
                        
                        DETECTION STATES:
                        Process waiting for input (ready for interact_with_process)
                        Process finished execution
                        Timeout reached (may still be running)

                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Read Process Output', readOnlyHint: true },
  },
  interact_with_process: {
    title: 'Send Input to Process',
    description: `
                        Send input to a running process and automatically receive the response.
                        
                        CRITICAL: THIS IS THE PRIMARY TOOL FOR ALL LOCAL FILE ANALYSIS
                        For ANY local file analysis (CSV, JSON, data processing), ALWAYS use this instead of the analysis tool.
                        The analysis tool CANNOT access local files and WILL FAIL - use processes for ALL file-based work.
                        
                        FILE ANALYSIS PRIORITY ORDER (MANDATORY):
                        1. ALWAYS FIRST: Use this tool (start_process + interact_with_process) for local data analysis
                        2. ALTERNATIVE: Use command-line tools (cut, awk, grep) for quick processing  
                        3. NEVER EVER: Use analysis tool for local file access (IT WILL FAIL)
                        
                        REQUIRED INTERACTIVE WORKFLOW FOR FILE ANALYSIS:
                        1. Start REPL: start_process("python3 -i")
                        2. Load libraries: interact_with_process(pid, "import pandas as pd, numpy as np")
                        3. Read file: interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
                        4. Analyze: interact_with_process(pid, "print(df.describe())")
                        5. Continue: interact_with_process(pid, "df.groupby('column').size()")
                        
                        BINARY FILE PROCESSING WORKFLOWS:
                        Use appropriate Python libraries (PyPDF2, pandas, docx2txt, etc.) or command-line tools for binary file analysis.
                        
                        SMART DETECTION:
                        - Automatically waits for REPL prompt (>>>, >, etc.)
                        - Detects errors and completion states
                        - Early exit prevents timeout delays
                        - Clean output formatting (removes prompts)
                        
                        SUPPORTED REPLs:
                        - Python: python3 -i (RECOMMENDED for data analysis)
                        - Node.js: node -i
                        - R: R
                        - Julia: julia
                        - Shell: bash, zsh
                        - Database: mysql, postgres
                        
                        PARAMETERS:
                        - pid: Process ID from start_process
                        - input: Code/command to execute
                        - timeout_ms: Max wait (default: 8000ms)
                        - wait_for_prompt: Auto-wait for response (default: true)
                        - verbose_timing: Enable detailed performance telemetry (default: false)

                        Returns execution result with status indicators.

                        PERFORMANCE DEBUGGING (verbose_timing parameter):
                        Set verbose_timing: true to get detailed timing information including:
                        - Exit reason (early_exit_quick_pattern, early_exit_periodic_check, process_finished, timeout, no_wait)
                        - Total duration and time to first output
                        - Complete timeline of all output events with timestamps
                        - Which detection mechanism triggered early exit
                        Use this to identify slow interactions and optimize detection patterns.

                        ALWAYS USE FOR: CSV analysis, JSON processing, file statistics, data visualization prep, ANY local file work
                        NEVER USE ANALYSIS TOOL FOR: Local file access (it cannot read files from disk and WILL FAIL)

                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Send Input to Process', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  force_terminate: {
    title: 'Force Terminate Process',
    description: `
                        Force terminate a running terminal session.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Force Terminate Process', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  list_sessions: {
    title: 'List Terminal Sessions',
    description: `
                        List all active terminal sessions.
                        
                        Shows session status including:
                        - PID: Process identifier  
                        - Blocked: Whether session is waiting for input
                        - Runtime: How long the session has been running
                        
                        DEBUGGING REPLs:
                        - "Blocked: true" often means REPL is waiting for input
                        - Use this to verify sessions are running before sending input
                        - Long runtime with blocked status may indicate stuck process
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'List Terminal Sessions', readOnlyHint: true },
  },
  list_processes: {
    title: 'List Running Processes',
    description: `
                        List all running processes.
                        
                        Returns process information including PID, command name, CPU usage, and memory usage.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'List Running Processes', readOnlyHint: true },
  },
  kill_process: {
    title: 'Kill Process',
    description: `
                        Terminate a running process by PID.

                        Use with caution as this will forcefully terminate the specified process.

                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Kill Process', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  get_usage_stats: {
    title: 'Get Usage Statistics',
    description: `
                        Get usage statistics for debugging and analysis.
                        
                        Returns summary of tool usage, success/failure counts, category totals, and session information.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get Usage Statistics', readOnlyHint: true },
  },
  get_recent_tool_calls: {
    title: 'Get Recent Tool Calls',
    description: `
                        Get recent local tool call history with arguments and outputs.
                        Returns a chronological list of recent calls loaded from the local history file.
                        
                        Useful for:
                        - Onboarding new chats about work already done
                        - Recovering context after chat history loss
                        - Debugging tool call sequences
                        - compact=true returns bounded redacted evidence capsules instead of raw outputs
                        - failuresOnly=true filters to failed calls; combine it with compact=true for Reflexion diagnosis
                        
                        Note: Does not track its own calls or UI-origin calls generated by embedded Agent Core UI surfaces.
                        History is persisted locally in tool-history.jsonl, keeps up to the last 1000
                        calls in memory, and trims older on-disk history. Stored outputs over 4 KiB
                        are replaced with an omission marker, but failed calls retain a separate bounded
                        redacted failure-family/excerpt capsule captured before output capping.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get Recent Tool Calls', readOnlyHint: true },
  },
  give_feedback_to_desktop_commander: {
    title: 'Give Feedback',
    description: `
                        Open feedback form in browser to provide feedback about Desktop Commander.
                        
                        IMPORTANT: This tool only opens the feedback form; it does not submit feedback for the user.
                        Survey answers are entered manually. Only local usage metadata listed below is added to the form URL.
                        
                        WORKFLOW:
                        1. When user agrees to give feedback, just call this tool immediately
                        2. No need to ask questions or collect information
                        3. Tool opens form with only usage statistics pre-filled automatically:
                           - tool_call_count: Number of commands they've made
                           - days_using: How many days they've used Desktop Commander
                           - platform: Their operating system (Mac/Windows/Linux)
                           - client_id: Analytics identifier
                        
                        All survey questions will be answered directly in the form:
                        - Job title and technical comfort level
                        - Company URL for industry context
                        - Other AI tools they use
                        - Desktop Commander's biggest advantage
                        - How they typically use it
                        - Recommendation likelihood (0-10)
                        - User study participation interest
                        - Email and any additional feedback
                        
                        EXAMPLE INTERACTION:
                        User: "sure, I'll give feedback"
                        Claude: "Perfect! Let me open the feedback form for you."
                        [calls tool immediately]
                        
                        No parameters are needed - just call the tool to open the form.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Give Feedback', readOnlyHint: false, openWorldHint: true },
  },
  browser_control: {
    title: 'Browser Control',
    description: `Control a browser through Agent Core's observed-action owner.
open defaults to an isolated Chromium process over loopback CDP. transport="extension" instead requests a one-use pairing code for the Agent Core Browser Bridge extension on an existing user-selected HTTP(S) tab; it launches no browser, creates no profile and preserves the existing login. The user must install the extension and explicitly connect the intended tab. Pairing expires after 5 minutes. Do not persist pairing codes or grant tokens.
Optional interactionCapabilities enables keyboard, held-key or history (default none).
observe returns visible text, safe independent controlStates, owned tabs and bounded action IDs. Optional canvas inventory lists up to 8 visible canvases; sample accepts only a previously observed canvasId, never a selector. Canvas defaults 32x16, max128x64 cells/palette16; lossy RGBA evidence, not object recognition or action coordinates. Operator colour labels are declarations.
act consumes exactly one sessionId/observationId/actionId. Operations include CLICK, TYPE_TEXT, SELECT, SCROLL, WAIT, SWITCH_TAB (isolated only) and opt-in PRESS_KEY/HOLD_KEY/BACK. Key choices are fixed; holds 150/400/800ms, always released best-effort. No modifiers, macros, arbitrary code, selectors, coordinates or external CDP endpoints. Stale document/target/focus fails closed; uncertainty never triggers blind retry. Dialogs are reported, not auto-accepted. Extension v1 observes the connected tab's main document; cross-origin iframe controls are not yet supported.
Password/file/hidden values remain excluded. Observations max120, consumed actions max60, candidates max250 with explicit omissions. TYPE_TEXT needs supplied text. close releases held input; isolated sessions terminate only their owned process and transient profile, extension sessions detach the debugger while retaining tab/browser. Extension grants live in RAM, expire after 30 minutes or 60 seconds without polling, and fail closed after command timeout. status lists sessions without pairing codes or tokens.
No hidden model/controller is invoked. AGENT_CORE_BROWSER_EXECUTABLE is an operator-only executable override.
${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Browser Control', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  get_prompts: {
    title: 'Get Prompts',
    description: `
                        Retrieve a specific Desktop Commander onboarding prompt by ID and execute it.
                        
                        SIMPLIFIED ONBOARDING V2: This tool only supports direct prompt retrieval.
                        The onboarding system presents 5 options as a simple numbered list:
                        
                        1. Organize my Downloads folder (promptId: 'onb2_01')
                        2. Explain a codebase or repository (promptId: 'onb2_02')
                        3. Create organized knowledge base (promptId: 'onb2_03')
                        4. Analyze a data file (promptId: 'onb2_04')
                        5. Check system health and resources (promptId: 'onb2_05')
                        
                        USAGE:
                        When user says "1", "2", "3", "4", or "5" from onboarding:
                        - "1" → get_prompts(action='get_prompt', promptId='onb2_01')
                        - "2" → get_prompts(action='get_prompt', promptId='onb2_02')
                        - "3" → get_prompts(action='get_prompt', promptId='onb2_03')
                        - "4" → get_prompts(action='get_prompt', promptId='onb2_04')
                        - "5" → get_prompts(action='get_prompt', promptId='onb2_05')
                        
                        The prompt content will be injected and execution begins immediately.

                        ${CMD_PREFIX_DESCRIPTION}`,
    annotations: { title: 'Get Prompts', readOnlyHint: true },
  },
} as const;
