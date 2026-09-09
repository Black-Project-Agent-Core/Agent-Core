// GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.

interface AnalyticsComponentHealth {
  status?: string;
  message?: string;
}

interface AnalyticsEngineSnapshot {
  applicationHost?: AnalyticsComponentHealth;
  productionAnalytics?: AnalyticsComponentHealth;
  protocol?: string;
  workerVersion?: string;
  lastWorkerError?: string;
  quantResearchLab?: AnalyticsComponentHealth;
  nativeAccelerator?: AnalyticsComponentHealth;
}

function analyticsComponentStatusText(health?: AnalyticsComponentHealth): string {
  if (!health) return '-';
  const status = health.status || 'unavailable';
  return health.message ? status + ' - ' + health.message : status;
}

function renderAnalyticsEngineDiagnostics(snapshot?: AnalyticsEngineSnapshot): void {
  if (!snapshot) return;
  const values: Record<string, string> = {
    applicationHostHealth: analyticsComponentStatusText(snapshot.applicationHost),
    productionAnalyticsHealth: analyticsComponentStatusText(snapshot.productionAnalytics),
    analyticsProtocol: snapshot.protocol || '-',
    workerVersion: snapshot.workerVersion || '-',
    lastWorkerError: snapshot.lastWorkerError || '-',
    quantResearchHealth: analyticsComponentStatusText(snapshot.quantResearchLab),
    nativeAcceleratorHealth: analyticsComponentStatusText(snapshot.nativeAccelerator)
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

async function loadAnalyticsEngineDiagnostics(): Promise<AnalyticsEngineSnapshot> {
  const snapshot = await api<AnalyticsEngineSnapshot>('/api/system/analytics-engine');
  renderAnalyticsEngineDiagnostics(snapshot);
  return snapshot;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAnalyticsEngineDiagnostics().catch(error => console.error(error));
});
