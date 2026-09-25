import { toolHistory } from '../utils/toolHistory.js';
import { GetRecentToolCallsArgsSchema } from '../tools/schemas.js';
import type { ServerResult } from '../types.js';
export async function handleGetRecentToolCalls(args: unknown): Promise<ServerResult> {
    try {
        const parsed = GetRecentToolCallsArgsSchema.parse(args);
        const options = {
            maxResults: parsed.maxResults,
            toolName: parsed.toolName,
            since: parsed.since,
            failuresOnly: parsed.failuresOnly,
        };
        const calls = parsed.compact
            ? toolHistory.getRecentCallsCompact(options)
            : toolHistory.getRecentCallsFormatted(options);
        const stats = toolHistory.getStats();
        // Format the response (excluding file path per user request)
        const summary = parsed.compact
            ? `Tool Call History (${calls.length} results, ${stats.totalEntries} total in memory, compact evidence)`
            : `Tool Call History (${calls.length} results, ${stats.totalEntries} total in memory)`;
        const historyJson = JSON.stringify(calls, null, 2);
        return {
            content: [{
                    type: "text",
                    text: `${summary}\n\n${historyJson}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Error getting tool history: ${error instanceof Error ? error.message : String(error)}`
                }],
            isError: true
        };
    }
}
