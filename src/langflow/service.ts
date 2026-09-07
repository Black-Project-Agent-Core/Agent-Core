import { readFile } from 'node:fs/promises';
import type { LangflowConfig } from '../config.js';
import { LangflowFabricError } from './errors.js';
import {
  addNodeToGraph,
  connectGraphNodes,
  createComponentNode,
  normalizeGraph,
  type LangflowFlowGraph,
  type LangflowNodePosition,
} from './graph.js';

export interface LangflowStatus {
  enabled: boolean;
  reachable: boolean;
  baseUrl: string;
  status: 'ok' | 'unreachable' | 'error' | 'disabled';
  httpStatus?: number;
}

export interface LangflowRunInput {
  flowIdOrName: string;
  inputValue?: string;
  inputType?: string;
  outputType?: string;
  tweaks?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  outputComponent?: string;
}

export interface LangflowCreateFlowInput {
  name: string;
  description?: string;
  projectId?: string;
  endpointName?: string;
  data?: LangflowFlowGraph;
}

export interface LangflowUpdateFlowInput {
  name?: string;
  description?: string;
  projectId?: string;
  endpointName?: string;
  data?: LangflowFlowGraph;
}

export interface LangflowAddComponentNodeInput {
  flowId: string;
  componentName: string;
  category?: string;
  position: LangflowNodePosition;
  nodeId?: string;
}

export interface LangflowConnectNodesInput {
  flowId: string;
  sourceNodeId: string;
  sourceOutputName: string;
  targetNodeId: string;
  targetInputName: string;
}

interface AutoLoginResponse {
  access_token?: unknown;
}

export class LangflowService {
  private autoLoginAccessToken: string | null = null;

  constructor(private readonly config: LangflowConfig) {}

  async status(): Promise<LangflowStatus> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        reachable: false,
        baseUrl: this.config.baseUrl,
        status: 'disabled',
      };
    }
    try {
      const response = await this.fetchRequest('/health', { method: 'GET' }, false);
      if (!response.ok) {
        return {
          enabled: true,
          reachable: true,
          baseUrl: this.config.baseUrl,
          status: 'error',
          httpStatus: response.status,
        };
      }
      const body = await this.parseJson(response);
      const status = body && typeof body === 'object' && 'status' in body
        ? String((body as Record<string, unknown>).status)
        : 'ok';
      return {
        enabled: true,
        reachable: true,
        baseUrl: this.config.baseUrl,
        status: status === 'ok' ? 'ok' : 'error',
        httpStatus: response.status,
      };
    } catch {
      return {
        enabled: true,
        reachable: false,
        baseUrl: this.config.baseUrl,
        status: 'unreachable',
      };
    }
  }

  async listProjects(): Promise<unknown[]> {
    return this.requestJsonArray('/api/v1/projects/');
  }

  async listFlows(): Promise<unknown[]> {
    return this.requestJsonArray('/api/v1/flows/?get_all=true&header_flows=true');
  }

  async listComponents(): Promise<Record<string, any>> {
    const value = await this.requestJson('/api/v1/all');
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new LangflowFabricError('LANGFLOW_RESPONSE_INVALID', 'Langflow returned an unexpected component catalog shape.');
    }
    return value as Record<string, any>;
  }

  async getFlow(flowId: string): Promise<unknown> {
    const id = requiredIdentifier(flowId, 'flowId');
    try {
      return await this.requestJson(`/api/v1/flows/${encodeURIComponent(id)}`);
    } catch (error) {
      if (!(error instanceof LangflowFabricError)
        || error.code !== 'LANGFLOW_HTTP_ERROR'
        || error.details?.httpStatus !== 404) {
        throw error;
      }
      const flows = await this.requestJsonArray('/api/v1/flows/?get_all=true&header_flows=false');
      const match = flows.find((flow) => (
        flow !== null
        && typeof flow === 'object'
        && String((flow as Record<string, unknown>).id ?? '') === id
      ));
      if (match !== undefined) return match;
      throw new LangflowFabricError('LANGFLOW_FLOW_NOT_FOUND', `Langflow flow ${JSON.stringify(id)} was not found.`);
    }
  }

  async createFlow(input: LangflowCreateFlowInput): Promise<unknown> {
    const body: Record<string, unknown> = {
      name: requiredIdentifier(input.name, 'name'),
      data: normalizeGraph(input.data ?? { nodes: [], edges: [] }),
    };
    if (input.description !== undefined) body.description = boundedOptionalText(input.description, 'description', 20_000);
    if (input.projectId !== undefined) body.folder_id = requiredIdentifier(input.projectId, 'projectId');
    if (input.endpointName !== undefined) body.endpoint_name = requiredIdentifier(input.endpointName, 'endpointName');
    return this.requestJson('/api/v1/flows/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateFlow(flowId: string, input: LangflowUpdateFlowInput): Promise<unknown> {
    const id = requiredIdentifier(flowId, 'flowId');
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = requiredIdentifier(input.name, 'name');
    if (input.description !== undefined) body.description = boundedOptionalText(input.description, 'description', 20_000);
    if (input.projectId !== undefined) body.folder_id = requiredIdentifier(input.projectId, 'projectId');
    if (input.endpointName !== undefined) body.endpoint_name = requiredIdentifier(input.endpointName, 'endpointName');
    if (input.data !== undefined) body.data = normalizeGraph(input.data);
    if (Object.keys(body).length === 0) {
      throw new LangflowFabricError('LANGFLOW_VALIDATION_FAILED', 'At least one flow field must be supplied for update.');
    }
    return this.requestJson(`/api/v1/flows/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async addComponentNode(input: LangflowAddComponentNodeInput): Promise<{
    flowId: string;
    nodeId: string;
    nodeCount: number;
    edgeCount: number;
  }> {
    const flowId = requiredIdentifier(input.flowId, 'flowId');
    const componentName = requiredIdentifier(input.componentName, 'componentName');
    const flow = flowRecord(await this.getFlow(flowId));
    const graph = normalizeGraph(flow.data);
    const catalog = await this.listComponents();
    const component = resolveCatalogComponent(catalog, componentName, input.category);
    const node = createComponentNode(componentName, component, input.position, input.nodeId);
    const nextGraph = addNodeToGraph(graph, node);
    await this.updateFlow(flowId, { data: nextGraph });
    return {
      flowId,
      nodeId: String(node.id),
      nodeCount: nextGraph.nodes.length,
      edgeCount: nextGraph.edges.length,
    };
  }

  async connectNodes(input: LangflowConnectNodesInput): Promise<{
    flowId: string;
    edgeId: string;
    nodeCount: number;
    edgeCount: number;
  }> {
    const flowId = requiredIdentifier(input.flowId, 'flowId');
    const flow = flowRecord(await this.getFlow(flowId));
    const graph = normalizeGraph(flow.data);
    const nextGraph = connectGraphNodes(graph, {
      sourceNodeId: input.sourceNodeId,
      sourceOutputName: input.sourceOutputName,
      targetNodeId: input.targetNodeId,
      targetInputName: input.targetInputName,
    });
    const edgeId = String(nextGraph.edges.at(-1)?.id ?? '');
    if (!edgeId) {
      throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', 'Langflow graph connection did not produce an edge ID.');
    }
    await this.updateFlow(flowId, { data: nextGraph });
    return {
      flowId,
      edgeId,
      nodeCount: nextGraph.nodes.length,
      edgeCount: nextGraph.edges.length,
    };
  }

  async deleteFlow(flowId: string): Promise<unknown> {
    const id = requiredIdentifier(flowId, 'flowId');
    return this.requestJson(`/api/v1/flows/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async runFlow(input: LangflowRunInput): Promise<unknown> {
    const flowId = await this.resolveFlowId(requiredIdentifier(input.flowIdOrName, 'flowIdOrName'));
    const body: Record<string, unknown> = {
      flow_id: flowId,
      input_value: input.inputValue ?? '',
      tweaks: input.tweaks ?? {},
      mode: 'sync',
    };
    if (input.sessionId !== undefined) body.session_id = input.sessionId;
    if (input.userId !== undefined) body.user_id = input.userId;
    if (input.outputComponent !== undefined) body.output_ids = [input.outputComponent];
    return this.requestJson('/api/v2/workflows', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async resolveFlowId(flowIdOrName: string): Promise<string> {
    if (isUuid(flowIdOrName)) return flowIdOrName;
    const flows = await this.listFlows();
    const exactEndpointMatches: string[] = [];
    const exactNameMatches: string[] = [];
    for (const candidate of flows) {
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as Record<string, unknown>;
      if (typeof record.id !== 'string' || !isUuid(record.id)) continue;
      if (record.endpoint_name === flowIdOrName) exactEndpointMatches.push(record.id);
      if (record.name === flowIdOrName) exactNameMatches.push(record.id);
    }
    const matches = exactEndpointMatches.length ? exactEndpointMatches : exactNameMatches;
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) {
      throw new LangflowFabricError(
        'LANGFLOW_FLOW_NOT_FOUND',
        `No Langflow flow matches ID, endpoint name, or flow name ${JSON.stringify(flowIdOrName)}.`,
      );
    }
    throw new LangflowFabricError(
      'LANGFLOW_FLOW_AMBIGUOUS',
      `Multiple Langflow flows match ${JSON.stringify(flowIdOrName)}; use the flow UUID instead.`,
    );
  }

  private async requestJsonArray(pathname: string): Promise<unknown[]> {
    const value = await this.requestJson(pathname);
    if (!Array.isArray(value)) {
      throw new LangflowFabricError('LANGFLOW_RESPONSE_INVALID', 'Langflow returned an unexpected response shape.');
    }
    return value;
  }

  private async requestJson(pathname: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.config.enabled) {
      throw new LangflowFabricError('LANGFLOW_DISABLED', 'Langflow integration is disabled.');
    }

    let response = await this.authenticatedRequest(pathname, init);
    if ((response.status === 401 || response.status === 403) && !this.config.apiKeyFile) {
      this.autoLoginAccessToken = null;
      response = await this.authenticatedRequest(pathname, init);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new LangflowFabricError(
          'LANGFLOW_AUTH_REQUIRED',
          'Langflow rejected authentication. Enable local AUTO_LOGIN or configure AGENT_CORE_LANGFLOW_API_KEY_FILE.',
          { httpStatus: response.status },
        );
      }
      throw new LangflowFabricError(
        'LANGFLOW_HTTP_ERROR',
        `Langflow request failed with HTTP ${response.status}.`,
        { httpStatus: response.status },
      );
    }
    return this.parseJson(response);
  }

  private async authenticatedRequest(pathname: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchRequest(pathname, init, true);
    } catch (error) {
      if (error instanceof LangflowFabricError) throw error;
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'Langflow request timed out.'
        : 'Langflow is not reachable on the configured loopback endpoint.';
      throw new LangflowFabricError('LANGFLOW_UNREACHABLE', message, undefined, error);
    }
  }

  private async fetchRequest(pathname: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      if (init.body !== undefined) headers.set('content-type', 'application/json');
      if (authenticated) await this.applyAuthentication(headers);
      return await fetch(new URL(pathname, `${this.config.baseUrl}/`), {
        ...init,
        headers,
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async applyAuthentication(headers: Headers): Promise<void> {
    const apiKey = await this.readApiKey();
    if (apiKey) {
      headers.set('x-api-key', apiKey);
      return;
    }
    headers.set('authorization', `Bearer ${await this.ensureAutoLoginAccessToken()}`);
  }

  private async ensureAutoLoginAccessToken(): Promise<string> {
    if (this.autoLoginAccessToken) return this.autoLoginAccessToken;
    let response: Response;
    try {
      response = await this.fetchRequest('/api/v1/auto_login', { method: 'GET' }, false);
    } catch (error) {
      throw new LangflowFabricError(
        'LANGFLOW_AUTH_REQUIRED',
        'Langflow auto-login session could not be established on the configured loopback endpoint.',
        undefined,
        error,
      );
    }
    if (!response.ok) {
      throw new LangflowFabricError(
        'LANGFLOW_AUTH_REQUIRED',
        'Langflow auto-login is unavailable. Configure AGENT_CORE_LANGFLOW_API_KEY_FILE for authenticated access.',
        { httpStatus: response.status },
      );
    }
    const body = await this.parseJson(response) as AutoLoginResponse;
    if (typeof body.access_token !== 'string' || !body.access_token.trim()) {
      throw new LangflowFabricError(
        'LANGFLOW_AUTH_REQUIRED',
        'Langflow auto-login did not return a usable access token.',
      );
    }
    this.autoLoginAccessToken = body.access_token;
    return this.autoLoginAccessToken;
  }

  private async readApiKey(): Promise<string | null> {
    if (!this.config.apiKeyFile) return null;
    let value: string;
    try {
      value = await readFile(this.config.apiKeyFile, 'utf8');
    } catch (error) {
      throw new LangflowFabricError(
        'LANGFLOW_API_KEY_MISSING',
        'The configured Langflow API key file could not be read.',
        undefined,
        error,
      );
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new LangflowFabricError('LANGFLOW_API_KEY_MISSING', 'The configured Langflow API key file is empty.');
    }
    return trimmed;
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new LangflowFabricError('LANGFLOW_RESPONSE_INVALID', 'Langflow returned invalid JSON.', undefined, error);
    }
  }
}

function flowRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LangflowFabricError('LANGFLOW_RESPONSE_INVALID', 'Langflow returned an unexpected flow shape.');
  }
  return value as Record<string, any>;
}

function resolveCatalogComponent(
  catalog: Record<string, any>,
  componentName: string,
  category?: string,
): Record<string, any> {
  if (category !== undefined) {
    const categoryName = requiredIdentifier(category, 'category');
    const categoryMap = catalog[categoryName];
    const component = categoryMap && typeof categoryMap === 'object' && !Array.isArray(categoryMap)
      ? categoryMap[componentName]
      : undefined;
    if (component && typeof component === 'object' && !Array.isArray(component)) return structuredClone(component);
    throw new LangflowFabricError(
      'LANGFLOW_COMPONENT_NOT_FOUND',
      `Langflow component ${JSON.stringify(componentName)} was not found in category ${JSON.stringify(categoryName)}.`,
    );
  }

  const matches: Array<{ category: string; component: Record<string, any> }> = [];
  for (const [categoryName, categoryMap] of Object.entries(catalog)) {
    if (categoryName === 'component_display_names' || !categoryMap || typeof categoryMap !== 'object' || Array.isArray(categoryMap)) continue;
    const component = (categoryMap as Record<string, unknown>)[componentName];
    if (component && typeof component === 'object' && !Array.isArray(component)) {
      matches.push({ category: categoryName, component: component as Record<string, any> });
    }
  }
  if (matches.length === 1) return structuredClone(matches[0]!.component);
  if (matches.length === 0) {
    throw new LangflowFabricError('LANGFLOW_COMPONENT_NOT_FOUND', `Langflow component ${JSON.stringify(componentName)} was not found.`);
  }
  throw new LangflowFabricError(
    'LANGFLOW_COMPONENT_AMBIGUOUS',
    `Langflow component ${JSON.stringify(componentName)} exists in multiple categories; specify category explicitly.`,
    { categories: matches.map((match) => match.category) },
  );
}

function requiredIdentifier(value: string, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new LangflowFabricError('LANGFLOW_VALIDATION_FAILED', `${label} is required.`);
  if (trimmed.length > 512 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new LangflowFabricError('LANGFLOW_VALIDATION_FAILED', `${label} must be a bounded printable identifier.`);
  }
  return trimmed;
}

function boundedOptionalText(value: string, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength || /\u0000/.test(value)) {
    throw new LangflowFabricError('LANGFLOW_VALIDATION_FAILED', `${label} must be a string no longer than ${maxLength} characters.`);
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
