import { readFile } from 'node:fs/promises'; import path from 'node:path';
import { describe, expect, it } from 'vitest';

it('requires every non-empty turn to route memory preflight and finalize memory before output',async()=>{
 const skill=await readFile(path.resolve('plugin','agent-core','skills','agent-core-capability-router','SKILL.md'),'utf8');
 expect(skill).toMatch(/every non-empty user turn/i); expect(skill).toContain('capability_route'); expect(skill).toContain('memory_turn_finalize'); expect(skill).toMatch(/before[^\n.]*final (?:assistant )?(?:answer|output)|final (?:assistant )?(?:answer|output)[^\n.]*memory_turn_finalize/i);
});

it('registers a dedicated memory_turn_finalize MCP tool',async()=>{
 const source=await readFile(path.resolve('src','mcp','memory-turn-tools.ts'),'utf8'); expect(source).toContain("'memory_turn_finalize'"); expect(source).toContain('applyPostflight'); expect(source).toContain('NO_DURABLE_MEMORY');
});
