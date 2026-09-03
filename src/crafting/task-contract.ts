import { createHash } from 'node:crypto';
import type { CraftingFeatureContract } from './types.js';

export interface CraftingFeatureDeclaration {
  featureId: string;
  title?: string;
  requiredBehaviors?: string[];
  requiredInvariants?: string[];
  explicitNonGoals?: string[];
  targetAuthorities?: string[];
  verificationRequirements?: string[];
  targetPaths?: string[];
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function normalized(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}
export function deriveCraftingFeatureContract(input: {
  task: string;
  context?: string;
  projectId: string;
  declaration: CraftingFeatureDeclaration;
}): CraftingFeatureContract {
  const featureId = input.declaration.featureId.trim();
  const objective = input.task.trim();
  const title = input.declaration.title?.trim() || featureId;
  if (!featureId || !objective || !title) throw new Error('Crafting route requires featureId and task objective');
  const shape = {
    featureId,
    title,
    objective,
    context: input.context?.trim() || '',
    projectId: input.projectId,
    requiredBehaviors: normalized(input.declaration.requiredBehaviors),
    requiredInvariants: normalized(input.declaration.requiredInvariants),
    explicitNonGoals: normalized(input.declaration.explicitNonGoals),
    targetAuthorities: normalized(input.declaration.targetAuthorities),
    verificationRequirements: normalized(input.declaration.verificationRequirements),
    targetPaths: normalized(input.declaration.targetPaths),
  };
  const planFingerprint = createHash('sha256').update(stableJson(shape), 'utf8').digest('hex');
  return {
    featureId: shape.featureId,
    title: shape.title,
    objective: shape.objective,
    requiredBehaviors: shape.requiredBehaviors,
    requiredInvariants: shape.requiredInvariants,
    explicitNonGoals: shape.explicitNonGoals,
    targetAuthorities: shape.targetAuthorities,
    verificationRequirements: shape.verificationRequirements,
    ...(shape.targetPaths.length ? { targetPaths: shape.targetPaths } : {}),
    planFingerprint,
  };
}
