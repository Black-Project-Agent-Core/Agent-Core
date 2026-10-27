import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'docs/verification/native-chat-resident-acceptance.json');
const keyName = process.argv.includes('--api-key') ? 'AGENT_CORE_API_KEY' : 'AGENT_CORE_CODEX_API_KEY';
const credential = process.env[keyName];
if (!credential) throw Error('Configured host MCP credential unavailable');
const port = process.env.AGENT_CORE_PORT ?? '8765';
const client = new Client({ name: 'native-chat-completion-validator', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
  authProvider: { token: async () => credential }, onInsufficientScope: 'throw', maxStepUpRetries: 0,
});
const payload = result => JSON.parse(result.content.find(part => part.type === 'text').text);
let session;
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: { ...args, ...(session ? { contractSession: session } : {}) } },
    undefined, { timeout: 600_000 });
  if (result.isError) throw Error(name + ': ' + result.content.find(part => part.type === 'text')?.text);
  return result;
};
try {
  await client.connect(transport);
  const tools = (await client.listTools(undefined, { cacheMode: 'refresh' })).tools;
  assert(tools.some(tool => tool.name === 'native_chat_bridge'));
  if (process.argv.includes('--discovery-only')) {
    console.log(JSON.stringify({ status: 'pass', transport: 'authenticated resident MCP',
      toolCount: tools.length, nativeChatBridge: true }));
    process.exitCode = 0;
  } else {
  const contract = await call('controller_contract', { action: 'read' });
  const receipt = JSON.parse(contract.content[0].text.match(/AGENT CORE CONTRACT RECEIPT\n(\{[^\n]+\})/)[1]);
  assert.equal(receipt.digest, 'sha256:263fbaefeabf40b55264a771d1a37743f8d966655d208fafa38a0ee2012a0302');
  session = receipt.contractSession;
  await call('controller_contract', { action: 'acknowledge', digest: receipt.digest });
  await call('memory_list', { workspace: 'agent-core' });
  const existing = await fs.readFile(file, 'utf8').then(JSON.parse, error => {
    if (error.code === 'ENOENT') return null; throw error;
  });
  const evidence = existing ?? { date: '2026-10-27', discovered: true, transport: 'authenticated resident MCP' };
  evidence.discovery = { toolCount: tools.length, nativeChatBridge: true,
    checkedAt: new Date().toISOString() };
  const save = () => fs.writeFile(file, JSON.stringify(evidence, null, 2) + '\n');
  const bridge = async args => payload(await call('native_chat_bridge', args));
  if (!evidence.conversationId) {
    const created = await bridge({ action: 'create', workspace: 'agent-core', title: 'Native Bridge Acceptance 2026-10-27' });
    evidence.conversationId = created.records.find(record => record.type === 'created').conversation.id;
    await save();
  }
  const request = { action: 'send', conversationId: evidence.conversationId,
    clientRequestId: 'native-bridge-full-acceptance-20261027',
    prompt: 'This is a simple conversation transport check. Reply exactly BRIDGE_PHASE_B_OK. No tools, code changes, research or verification work is needed.' };
  evidence.requestId = request.clientRequestId; await save();
  if (!evidence.firstSend) { evidence.firstSend = await bridge(request); await save(); }
  evidence.replay = await bridge(request); await save();
  const listed = await bridge({ action: 'list' });
  const list = listed.records.find(record => record.type === 'list');
  assert(list.conversations.some(conversation => conversation.id === evidence.conversationId));
  evidence.list = { count: list.count, matchedConversationId: evidence.conversationId, metrics: listed.metrics };
  evidence.negative = [];
  for (const args of [
    { action: 'read', conversationId: 'nonexistent-native-bridge-acceptance-20261027' },
    { action: 'cancel', turnId: 'nonexistent-native-bridge-acceptance-20261027' },
  ]) {
    const failed = await client.callTool({ name: 'native_chat_bridge', arguments: { ...args, contractSession: session } });
    assert.equal(failed.isError, true);
    const error = payload(failed);
    evidence.negative.push({ action: args.action, isError: true, ...error });
    await save();
    assert(error.metrics.outputBytes <= 512 * 1024);
    assert(error.records.some(record => record.type === 'error'
      && (args.action === 'read' ? /not_found/.test(record.error) : record.error === 'HTTP_404')));
  }
  evidence.readback = await bridge({ action: 'read', conversationId: evidence.conversationId, maxMessages: 10 });
  const detail = evidence.readback.records.find(record => record.type === 'conversation');
  assert.equal(detail.turns.length, 1);
  assert.equal(detail.turns[0].messageOrigin, 'external-controller');
  assert.equal(detail.turns[0].status, 'finalized');
  assert.equal(detail.messages.filter(message => message.role === 'user').length, 1);
  assert.equal(detail.messages.filter(message => message.role === 'assistant').length, 1);
  assert(detail.messages.find(message => message.role === 'assistant').content.includes('BRIDGE_PHASE_B_OK'));
  assert.equal(evidence.replay.records.find(record => record.type === 'result').result.replayed, true);
  const serialized = JSON.stringify(evidence);
  assert(!serialized.includes(credential));
  assert(!process.env.AGENT_CORE_UI_TOKEN || !serialized.includes(process.env.AGENT_CORE_UI_TOKEN));
  evidence.status = 'pass'; evidence.checkedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: evidence.status, conversationId: evidence.conversationId,
    turnId: detail.turns[0].id, messageCount: detail.messages.length, replayed: true }));
  }
} finally { await client.close(); }
