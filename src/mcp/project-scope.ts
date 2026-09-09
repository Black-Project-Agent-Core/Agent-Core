import type { VerifiedKey } from '../auth/key-types.js';
import { AgentCoreRouteError, type RouteContext } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { WorkspaceProjectError } from '../runtime/workspace.js';

export interface ResolvedRouteProject {
  route: RouteContext;
  projectId: string;
}

export function persistentPrincipalId(runtime: RuntimeServices, key: VerifiedKey): string {
  return runtime.memory.config.principalId ?? key.id;
}

export function resolvedRouteProject(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId: string,
): ResolvedRouteProject {
  const route = runtime.routes.getOwned(routeContextId, key.id);
  const projectId = route.projectId ?? runtime.workspace.resolveProjectRoot();
  return { route, projectId };
}


export function resolveAuditProjectId(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId: string,
): string {
  try {
    const route = runtime.routes.getOwned(routeContextId, key.id);
    return route.projectId ?? runtime.workspace.resolveProjectRoot();
  } catch {
    return runtime.workspace.resolveProjectRoot();
  }
}

export function resolvedProjectScope(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId?: string,
): { principalId: string; projectId: string } {
  if (routeContextId) {
    const { projectId } = resolvedRouteProject(runtime, key, routeContextId);
    return { principalId: key.id, projectId };
  }
  return { principalId: key.id, projectId: runtime.workspace.resolveProjectRoot() };
}

export function resolvedMemoryProjectScope(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId?: string,
): { principalId: string; projectId: string } {
  const project = resolvedProjectScope(runtime, key, routeContextId);
  return { principalId: persistentPrincipalId(runtime, key), projectId: project.projectId };
}

function projectMismatch(error: unknown, projectId: string, target: string): never {
  if (error instanceof WorkspaceProjectError && error.code === 'WORKSPACE_PROJECT_MISMATCH') {
    throw new AgentCoreRouteError(
      'ROUTE_PROJECT_MISMATCH',
      `Target is outside the routed project: ${target}`,
      { projectId, target },
    );
  }
  throw error;
}

export async function resolveRouteExistingPath(
  runtime: RuntimeServices,
  route: RouteContext,
  target: string,
): Promise<string> {
  const projectId = route.projectId ?? runtime.workspace.resolveProjectRoot();
  try {
    return await runtime.workspace.resolveExistingInProject(projectId, target);
  } catch (error) {
    return projectMismatch(error, projectId, target);
  }
}

export async function resolveRouteTargetPath(
  runtime: RuntimeServices,
  route: RouteContext,
  target: string,
): Promise<string> {
  const projectId = route.projectId ?? runtime.workspace.resolveProjectRoot();
  try {
    return await runtime.workspace.resolveTargetInProject(projectId, target);
  } catch (error) {
    return projectMismatch(error, projectId, target);
  }
}
