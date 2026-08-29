"use strict";
// GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.
function analyticsComponentStatusText(health) {
    if (!health)
        return '-';
    const status = health.status || 'unavailable';
    return health.message ? status + ' - ' + health.message : status;
}
function renderAnalyticsEngineDiagnostics(snapshot) {
    if (!snapshot)
        return;
    const values = {
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
        if (el)
            el.textContent = value;
    });
}
async function loadAnalyticsEngineDiagnostics() {
    const snapshot = await api('/api/system/analytics-engine');
    renderAnalyticsEngineDiagnostics(snapshot);
    return snapshot;
}
document.addEventListener('DOMContentLoaded', () => {
    loadAnalyticsEngineDiagnostics().catch(error => console.error(error));
});
