/**
 * AUTO-GENERATED from agent-status-v3-state-map.json (Unified Status Indicator v3, 32 states).
 * Do not edit by hand; regenerate with a throwaway node command against the state map.
 *
 * One immutable card footprint: every activity replaces the contents of the same fixed card.
 */

export type ActivityGroup = "Cognition" | "Discovery" | "Operations" | "Production" | "Quality" | "Lifecycle"

export type ActivityStateId = "thinking" | "planning" | "reading" | "viewing_image" | "analyzing_image" | "web_search" | "browsing" | "memory_search" | "data_analysis" | "using_skill" | "using_tool" | "command" | "coding" | "indexing" | "syncing" | "creating" | "editing" | "image_generation" | "rendering" | "downloading" | "uploading" | "saving" | "exporting" | "testing" | "verifying" | "debugging" | "repairing" | "memory_write" | "waiting" | "retrying" | "complete" | "error"

export type ActivityState = {
  id: ActivityStateId;
  group: ActivityGroup;
  title: string;
  desc: string;
  /** Icon key; identical to the state id in the v3 state map. */
  icon: ActivityStateId;
  signal: ActivitySignalKind;
  color: string;
  color2: string;
  rgb: string;
  mini: string;
};

export type ActivitySignalKind = "dots" | "steps" | "line" | "pulse" | "scan" | "bars" | "spark" | "terminal" | "wave" | "check"

export const ACTIVITY_STATES: Record<ActivityStateId, ActivityState> = {
  thinking: {
    id: "thinking",
    group: "Cognition",
    title: "Thinking…",
    desc: "Understanding the request and its constraints.",
    icon: "thinking",
    signal: "dots",
    color: "#B393FF",
    color2: "#628DFF",
    rgb: "167,127,255",
    mini: "Understanding the request"
  },
  planning: {
    id: "planning",
    group: "Cognition",
    title: "Planning…",
    desc: "Breaking the task into actionable steps.",
    icon: "planning",
    signal: "steps",
    color: "#9EABFF",
    color2: "#648BFF",
    rgb: "136,149,255",
    mini: "Organizing the next steps"
  },
  reading: {
    id: "reading",
    group: "Discovery",
    title: "Reading files…",
    desc: "Reading documents, briefs, and source code.",
    icon: "reading",
    signal: "line",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Inspecting text and code"
  },
  viewing_image: {
    id: "viewing_image",
    group: "Discovery",
    title: "Viewing image…",
    desc: "Opening an image for visual inspection.",
    icon: "viewing_image",
    signal: "pulse",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Looking at an image"
  },
  analyzing_image: {
    id: "analyzing_image",
    group: "Discovery",
    title: "Analyzing image…",
    desc: "Examining visual details and structure.",
    icon: "analyzing_image",
    signal: "scan",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Inspecting image content"
  },
  web_search: {
    id: "web_search",
    group: "Discovery",
    title: "Searching the web…",
    desc: "Finding current external information.",
    icon: "web_search",
    signal: "dots",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Looking for relevant sources"
  },
  browsing: {
    id: "browsing",
    group: "Discovery",
    title: "Browsing page…",
    desc: "Navigating and inspecting a webpage.",
    icon: "browsing",
    signal: "line",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Exploring the current page"
  },
  memory_search: {
    id: "memory_search",
    group: "Discovery",
    title: "Searching memory…",
    desc: "Retrieving relevant stored context.",
    icon: "memory_search",
    signal: "dots",
    color: "#FFD28A",
    color2: "#EBA46C",
    rgb: "235,183,111",
    mini: "Recalling relevant context"
  },
  data_analysis: {
    id: "data_analysis",
    group: "Discovery",
    title: "Analyzing data…",
    desc: "Examining patterns and calculations.",
    icon: "data_analysis",
    signal: "bars",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Working with data"
  },
  using_skill: {
    id: "using_skill",
    group: "Operations",
    title: "Using skill…",
    desc: "Applying a task-specific skill or workflow.",
    icon: "using_skill",
    signal: "spark",
    color: "#E59DFF",
    color2: "#8782FF",
    rgb: "200,126,249",
    mini: "Loading specialized guidance"
  },
  using_tool: {
    id: "using_tool",
    group: "Operations",
    title: "Using tool…",
    desc: "Calling a tool and processing its result.",
    icon: "using_tool",
    signal: "bars",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Executing a supported tool"
  },
  command: {
    id: "command",
    group: "Operations",
    title: "Running command…",
    desc: "Executing a terminal or system command.",
    icon: "command",
    signal: "terminal",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Executing a command"
  },
  coding: {
    id: "coding",
    group: "Operations",
    title: "Writing code…",
    desc: "Composing code for a specific task.",
    icon: "coding",
    signal: "line",
    color: "#9EABFF",
    color2: "#648BFF",
    rgb: "136,149,255",
    mini: "Composing code"
  },
  indexing: {
    id: "indexing",
    group: "Operations",
    title: "Indexing…",
    desc: "Building or updating a searchable index.",
    icon: "indexing",
    signal: "steps",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Structuring indexed content"
  },
  syncing: {
    id: "syncing",
    group: "Operations",
    title: "Syncing…",
    desc: "Synchronizing information between components.",
    icon: "syncing",
    signal: "wave",
    color: "#9EABFF",
    color2: "#648BFF",
    rgb: "136,149,255",
    mini: "Synchronizing state"
  },
  creating: {
    id: "creating",
    group: "Production",
    title: "Creating…",
    desc: "Creating a new file, asset, or result.",
    icon: "creating",
    signal: "spark",
    color: "#B393FF",
    color2: "#628DFF",
    rgb: "167,127,255",
    mini: "Making something new"
  },
  editing: {
    id: "editing",
    group: "Production",
    title: "Editing…",
    desc: "Modifying an existing file or artifact.",
    icon: "editing",
    signal: "line",
    color: "#E59DFF",
    color2: "#8782FF",
    rgb: "200,126,249",
    mini: "Changing an existing item"
  },
  image_generation: {
    id: "image_generation",
    group: "Production",
    title: "Generating image…",
    desc: "Generating a new image asset.",
    icon: "image_generation",
    signal: "spark",
    color: "#E59DFF",
    color2: "#8782FF",
    rgb: "200,126,249",
    mini: "Creating an image asset"
  },
  rendering: {
    id: "rendering",
    group: "Production",
    title: "Rendering…",
    desc: "Producing the visual output from source.",
    icon: "rendering",
    signal: "bars",
    color: "#B393FF",
    color2: "#628DFF",
    rgb: "167,127,255",
    mini: "Rendering visual output"
  },
  downloading: {
    id: "downloading",
    group: "Production",
    title: "Downloading…",
    desc: "Receiving a file from a source.",
    icon: "downloading",
    signal: "line",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Receiving a file"
  },
  uploading: {
    id: "uploading",
    group: "Production",
    title: "Uploading…",
    desc: "Transferring a file to a destination.",
    icon: "uploading",
    signal: "line",
    color: "#5FE0EA",
    color2: "#54A8FF",
    rgb: "56,208,229",
    mini: "Sending a file"
  },
  saving: {
    id: "saving",
    group: "Production",
    title: "Saving…",
    desc: "Writing results to the selected destination.",
    icon: "saving",
    signal: "pulse",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Saving output"
  },
  exporting: {
    id: "exporting",
    group: "Production",
    title: "Exporting…",
    desc: "Converting output into a deliverable format.",
    icon: "exporting",
    signal: "steps",
    color: "#64A9FF",
    color2: "#4A7BFF",
    rgb: "89,146,251",
    mini: "Preparing a deliverable"
  },
  testing: {
    id: "testing",
    group: "Quality",
    title: "Testing…",
    desc: "Running checks against expected behavior.",
    icon: "testing",
    signal: "bars",
    color: "#57E3C2",
    color2: "#34B6CE",
    rgb: "58,205,175",
    mini: "Executing test cases"
  },
  verifying: {
    id: "verifying",
    group: "Quality",
    title: "Verifying…",
    desc: "Checking evidence and result correctness.",
    icon: "verifying",
    signal: "line",
    color: "#57E3C2",
    color2: "#34B6CE",
    rgb: "58,205,175",
    mini: "Reviewing observed evidence"
  },
  debugging: {
    id: "debugging",
    group: "Quality",
    title: "Debugging…",
    desc: "Investigating an observed problem.",
    icon: "debugging",
    signal: "pulse",
    color: "#FFD28A",
    color2: "#EBA46C",
    rgb: "235,183,111",
    mini: "Locating a fault"
  },
  repairing: {
    id: "repairing",
    group: "Quality",
    title: "Repairing…",
    desc: "Applying a targeted correction.",
    icon: "repairing",
    signal: "steps",
    color: "#FFD28A",
    color2: "#EBA46C",
    rgb: "235,183,111",
    mini: "Fixing a confirmed issue"
  },
  memory_write: {
    id: "memory_write",
    group: "Lifecycle",
    title: "Updating memory…",
    desc: "Saving confirmed, reusable information.",
    icon: "memory_write",
    signal: "dots",
    color: "#FFD28A",
    color2: "#EBA46C",
    rgb: "235,183,111",
    mini: "Persisting useful knowledge"
  },
  waiting: {
    id: "waiting",
    group: "Lifecycle",
    title: "Waiting…",
    desc: "Waiting for an external event or input.",
    icon: "waiting",
    signal: "dots",
    color: "#A2B8D9",
    color2: "#6A8FBF",
    rgb: "139,164,201",
    mini: "Awaiting a required response"
  },
  retrying: {
    id: "retrying",
    group: "Lifecycle",
    title: "Retrying…",
    desc: "Trying again using a changed approach.",
    icon: "retrying",
    signal: "wave",
    color: "#FFD28A",
    color2: "#EBA46C",
    rgb: "235,183,111",
    mini: "Recovering from a failed step"
  },
  complete: {
    id: "complete",
    group: "Lifecycle",
    title: "Completed",
    desc: "The requested work has finished.",
    icon: "complete",
    signal: "check",
    color: "#79F0B6",
    color2: "#38BE91",
    rgb: "68,224,152",
    mini: "Task finished"
  },
  error: {
    id: "error",
    group: "Lifecycle",
    title: "Encountered an issue",
    desc: "An operation failed; details are available.",
    icon: "error",
    signal: "pulse",
    color: "#FF8097",
    color2: "#F65B75",
    rgb: "251,92,124",
    mini: "Needs attention"
  },
};

export const ACTIVITY_STATE_ORDER: readonly ActivityStateId[] = ["thinking", "planning", "reading", "viewing_image", "analyzing_image", "web_search", "browsing", "memory_search", "data_analysis", "using_skill", "using_tool", "command", "coding", "indexing", "syncing", "creating", "editing", "image_generation", "rendering", "downloading", "uploading", "saving", "exporting", "testing", "verifying", "debugging", "repairing", "memory_write", "waiting", "retrying", "complete", "error"];
