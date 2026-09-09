import { AsyncLocalStorage } from 'node:async_hooks';

export type OperationAuthorizer = (toolName: string, input: Record<string, unknown>) => Promise<void>;
const operations = new AsyncLocalStorage<OperationAuthorizer>();

/** Carries server-established authority across an operation's asynchronous calls. */
export function withOperationAuthority<T>(authorize: OperationAuthorizer, operation: () => Promise<T>): Promise<T> {
  return operations.run(authorize, operation);
}

export async function authorizeServiceOperation(toolName: string, input: Record<string, unknown>, required: boolean): Promise<void> {
  const authorize = operations.getStore();
  if (authorize) return authorize(toolName, input);
  if (required) throw Object.assign(new Error('A routed task operation is required before accessing this runtime service'), { code: 'WORKFLOW_CONTEXT_REQUIRED' });
}
