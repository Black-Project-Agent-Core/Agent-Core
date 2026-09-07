import { randomUUID } from 'node:crypto';
import { LangflowFabricError } from './errors.js';

export interface LangflowFlowGraph {
  nodes: Array<Record<string, any>>;
  edges: Array<Record<string, any>>;
}

export interface LangflowNodePosition {
  x: number;
  y: number;
}

export interface ConnectGraphNodesInput {
  sourceNodeId: string;
  sourceOutputName: string;
  targetNodeId: string;
  targetInputName: string;
}

export function createComponentNode(
  componentType: string,
  component: Record<string, any>,
  position: LangflowNodePosition,
  nodeId = `${requiredText(componentType, 'componentType')}-${randomUUID().replace(/-/g, '').slice(0, 5)}`,
): Record<string, any> {
  const id = requiredText(nodeId, 'nodeId');
  const type = requiredText(componentType, 'componentType');
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', 'Node position must contain finite x and y values.');
  }
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', 'Component definition must be an object.');
  }
  const componentCopy = structuredClone(component);
  return {
    id,
    type: 'genericNode',
    position: { x: position.x, y: position.y },
    data: {
      node: componentCopy,
      showNode: componentCopy.minimized !== true,
      type,
      id,
    },
  };
}

export function addNodeToGraph(graph: unknown, node: Record<string, any>): LangflowFlowGraph {
  const normalized = normalizeGraph(graph);
  const nodeId = requiredText(node?.id, 'node.id');
  if (normalized.nodes.some((candidate) => candidate?.id === nodeId)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_DUPLICATE_NODE', `Node ${JSON.stringify(nodeId)} already exists in the flow graph.`);
  }
  return {
    nodes: [...normalized.nodes, structuredClone(node)],
    edges: [...normalized.edges],
  };
}

export function connectGraphNodes(graph: unknown, input: ConnectGraphNodesInput): LangflowFlowGraph {
  const normalized = normalizeGraph(graph);
  const sourceNodeId = requiredText(input.sourceNodeId, 'sourceNodeId');
  const targetNodeId = requiredText(input.targetNodeId, 'targetNodeId');
  const sourceOutputName = requiredText(input.sourceOutputName, 'sourceOutputName');
  const targetInputName = requiredText(input.targetInputName, 'targetInputName');

  const source = normalized.nodes.find((node) => node?.id === sourceNodeId);
  const target = normalized.nodes.find((node) => node?.id === targetNodeId);
  if (!source) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_NODE_NOT_FOUND', `Source node ${JSON.stringify(sourceNodeId)} was not found.`);
  }
  if (!target) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_NODE_NOT_FOUND', `Target node ${JSON.stringify(targetNodeId)} was not found.`);
  }

  const sourceComponent = componentDefinition(source);
  const targetComponent = componentDefinition(target);
  const outputs = Array.isArray(sourceComponent.outputs) ? sourceComponent.outputs : [];
  const output = outputs.find((candidate: any) => candidate?.name === sourceOutputName);
  if (!output) {
    throw new LangflowFabricError(
      'LANGFLOW_GRAPH_OUTPUT_NOT_FOUND',
      `Source output ${JSON.stringify(sourceOutputName)} was not found on node ${JSON.stringify(sourceNodeId)}.`,
    );
  }

  const template = targetComponent.template;
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new LangflowFabricError(
      'LANGFLOW_GRAPH_INPUT_NOT_FOUND',
      `Target node ${JSON.stringify(targetNodeId)} has no input template.`,
    );
  }
  const inputField = (template as Record<string, any>)[targetInputName];
  if (!inputField || typeof inputField !== 'object' || Array.isArray(inputField)) {
    throw new LangflowFabricError(
      'LANGFLOW_GRAPH_INPUT_NOT_FOUND',
      `Target input ${JSON.stringify(targetInputName)} was not found on node ${JSON.stringify(targetNodeId)}.`,
    );
  }

  const sourceType = requiredText(source?.data?.type, 'source node type');
  const outputTypes = stringArray(output.types ?? output.output_types);
  if (outputTypes.length === 0) {
    throw new LangflowFabricError(
      'LANGFLOW_GRAPH_OUTPUT_INVALID',
      `Source output ${JSON.stringify(sourceOutputName)} has no output types.`,
    );
  }
  const inputTypes = stringArray(inputField.input_types ?? inputField.inputTypes);
  const targetType = requiredText(inputField.type, `target input ${targetInputName} type`);

  const sourceHandleObject = {
    dataType: sourceType,
    id: sourceNodeId,
    name: sourceOutputName,
    output_types: outputTypes,
  };
  const targetHandleObject = {
    fieldName: targetInputName,
    id: targetNodeId,
    inputTypes,
    type: targetType,
  };
  const sourceHandle = escapedHandle(sourceHandleObject);
  const targetHandle = escapedHandle(targetHandleObject);
  const edgeId = `reactflow__edge-${sourceNodeId}${sourceHandle}-${targetNodeId}${targetHandle}`;
  if (normalized.edges.some((edge) => edge?.id === edgeId)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_DUPLICATE_EDGE', 'The requested connection already exists in the flow graph.');
  }

  return {
    nodes: [...normalized.nodes],
    edges: [
      ...normalized.edges,
      {
        animated: false,
        id: edgeId,
        selected: false,
        source: sourceNodeId,
        sourceHandle,
        target: targetNodeId,
        targetHandle,
        data: {
          sourceHandle: sourceHandleObject,
          targetHandle: targetHandleObject,
        },
      },
    ],
  };
}

export function normalizeGraph(graph: unknown): LangflowFlowGraph {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', 'Flow data must be an object with nodes and edges arrays.');
  }
  const record = graph as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', 'Flow data must contain nodes and edges arrays.');
  }
  return {
    nodes: structuredClone(record.nodes) as Array<Record<string, any>>,
    edges: structuredClone(record.edges) as Array<Record<string, any>>,
  };
}

function componentDefinition(node: Record<string, any>): Record<string, any> {
  const component = node?.data?.node;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', `Node ${JSON.stringify(node?.id ?? '')} has no component definition.`);
  }
  return component as Record<string, any>;
}

function escapedHandle(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/"/g, 'œ');
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', `${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 512 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new LangflowFabricError('LANGFLOW_GRAPH_VALIDATION_FAILED', `${label} must be a bounded printable string.`);
  }
  return trimmed;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
