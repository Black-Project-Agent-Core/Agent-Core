import type { Client } from '@modelcontextprotocol/client';

export async function acknowledgeControllerContract(call: (name: string, args: any) => Promise<any>) {
  const read = await call('controller_contract', { action: 'read' });
  if (read.isError) throw Error(JSON.stringify(read));
  const text = read.content.find((part: any) => part.type === 'text').text;
  const receipt = JSON.parse(text.split('\n\nAGENT CORE CONTRACT RECEIPT\n')[1]);
  const acknowledged = await call('controller_contract', { action: 'acknowledge',
    contractSession: receipt.contractSession, digest: receipt.digest });
  if (acknowledged.isError) throw Error(JSON.stringify(acknowledged));
  return receipt.contractSession as string;
}

/** Existing transport fixtures use the public handshake, never an admission bypass. */
export async function attachControllerContract(client: Client) {
  const call = client.callTool.bind(client);
  const contractSession = await acknowledgeControllerContract((name, args) => call({ name, arguments: args }));
  client.callTool = ((request: any, ...rest: any[]) => call({ ...request,
    arguments: { ...request.arguments, contractSession } }, ...rest)) as typeof client.callTool;
  return contractSession;
}
