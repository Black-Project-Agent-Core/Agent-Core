// Reconstructed from surviving local dist; emitted runtime parity checked.
import type { CodeProviderCapabilities } from './types.js';
export interface GrafelCliCapabilityProbe { groupAdd: boolean; trackWorktrees: boolean; branches: boolean; fitness: boolean; quarantine: boolean; }
export const GRAFEL_CORE_TOOLS = [
    'grafel_index_status',
    'grafel_orient',
    'grafel_find',
    'grafel_inspect',
    'grafel_related',
    'grafel_find_paths',
    'grafel_subgraph',
    'grafel_trace',
    'grafel_endpoints',
    'grafel_cross_links',
    'grafel_impact_radius',
    'grafel_diff',
];
export function deriveProviderCapabilities(toolNames: string[], cli: GrafelCliCapabilityProbe): CodeProviderCapabilities {
    const set = new Set(toolNames);
    const issues = [];
    const coreNavigation = GRAFEL_CORE_TOOLS.every(name => set.has(name));
    if (!coreNavigation) {
        const missing = GRAFEL_CORE_TOOLS.filter(name => !set.has(name));
        issues.push(`missing required core tools: ${missing.join(', ')}`);
    }
    const workspaceRouting = coreNavigation && cli.groupAdd;
    const refGraphs = workspaceRouting && cli.trackWorktrees && cli.branches;
    const repairs = set.has('grafel_docgen_apply');
    const fitness = cli.fitness;
    const diagnostics = coreNavigation;
    const quarantine = cli.quarantine;
    const patterns = set.has('grafel_patterns');
    const messaging = set.has('grafel_related') && set.has('grafel_orient');
    const graphPatterns = patterns;
    const crossLinkCandidates = set.has('grafel_cross_links');
    const enrichmentCandidates = set.has('grafel_docgen_apply');
    const dynamicToolRefresh = true;
    if (!workspaceRouting)
        issues.push('dynamic workspace routing unavailable');
    if (!refGraphs)
        issues.push('branch/ref/worktree graph support unavailable');
    if (!repairs)
        issues.push('residual repair tool unavailable');
    if (!fitness)
        issues.push('fitness CLI unavailable');
    if (!quarantine)
        issues.push('quarantine CLI unavailable');
    if (!patterns)
        issues.push('patterns tool unavailable');
    if (!messaging)
        issues.push('messaging traversal unavailable');
    if (!crossLinkCandidates)
        issues.push('cross-link candidate lifecycle unavailable');
    if (!enrichmentCandidates)
        issues.push('enrichment candidate lifecycle unavailable');
    return {
        coreNavigation,
        workspaceRouting,
        refGraphs,
        repairs,
        fitness,
        diagnostics,
        quarantine,
        patterns,
        messaging,
        graphPatterns,
        crossLinkCandidates,
        enrichmentCandidates,
        dynamicToolRefresh,
        toolNames: [...toolNames].sort(),
        issues,
    };
}
