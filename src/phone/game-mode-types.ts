export interface GameRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GameMetricName = 'brightness' | 'contrast' | 'red' | 'green' | 'blue' | 'darkness';

export interface GameStateCondition {
  region: string;
  metric: GameMetricName;
  min?: number;
  max?: number;
}

export interface GameStateRule {
  state: string;
  conditions: GameStateCondition[];
  minConfidence?: number;
}

export type GameActionCategory =
  | 'navigation' | 'battle' | 'skill' | 'party' | 'character'
  | 'inventory' | 'economy' | 'summon' | 'premium' | 'system';

export interface GameActionSemantic {
  id: string;
  category: GameActionCategory;
  cooldownMs?: number;
  reversible?: boolean;
  premiumSensitive?: boolean;
}
export interface GameAnchor {
  id: string;
  region: GameRegion;
  templateFile?: string;
  hits: number;
  misses: number;
  confidence: number;
  lastVerifiedAt?: string;
  gameVersion?: string;
}

export interface GameProfile {
  schemaVersion: 1;
  gameId: string;
  displayName?: string;
  packageName: string;
  version?: string;
  regions: Record<string, GameRegion>;
  stateRules: GameStateRule[];
  anchors: Record<string, GameAnchor>;
  actions: Record<string, GameActionSemantic>;
  resourceGuards: Record<string, unknown>;
  taskPolicies: Record<string, unknown>;
  updatedAt: string;
}

export interface GameObservationSummary {
  at: string;
  state?: string;
  confidence?: number;
  foregroundPackage?: string | null;
  evidenceRef?: string;
}
export interface GameOutcome {
  at: string;
  kind: 'success' | 'failure' | 'neutral';
  scope?: 'battle' | 'workflow' | 'navigation' | 'experiment' | 'other';
  summary: string;
  evidenceRef?: string;
  durationMs?: number;
}

export interface GameSessionState {
  schemaVersion: 1;
  sessionId: string;
  gameId: string;
  packageName: string;
  gameVersion?: string;
  startedAt: string;
  updatedAt: string;
  objective?: string;
  /** Advisory controller-supplied label for comparing independently run sessions, not authenticated identity. */
  controllerLabel?: string;
  currentState?: string;
  stateConfidence?: number;
  mode?: string;
  stage?: string;
  party?: string[];
  roster?: Record<string, unknown>;
  resources?: Record<string, number | string>;
  hypothesis?: string;
  predictedEvents?: Array<{ at: string; kind: string; label: string }>;
  /** Operational cooldown deadlines only; never canonical knowledge. */
  actionCooldowns?: Record<string, string>;
  /** Timestamp and evidence for mutable session fields (observed vs predicted is kept explicit). */
  fieldObservations?: Record<string, { at: string; confidence?: number; evidenceRef?: string }>;
  progress?: { lastFrameDigest?: string; repeatedNoProgress: number; stuck: boolean; lastChangeAt?: string };
  recentObservations: GameObservationSummary[];
  recentOutcomes: GameOutcome[];
}

export interface GameRegionMetrics {
  region: string;
  brightness: number;
  contrast: number;
  red: number;
  green: number;
  blue: number;
  darkness: number;
}

export interface GameClassification {
  state: string | null;
  confidence: number;
  ambiguous: boolean;
  metrics: GameRegionMetrics[];
}
