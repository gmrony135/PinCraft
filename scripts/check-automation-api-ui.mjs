// Compatibility command: the former monolithic Dashboard UI was retired.
// The current suite exercises separate Connector/Automation/Dashboard/billing
// APIs and guarded local browser flows. Historical results remain in docs/.
console.log('Running current automation-first API/UI verification (separate page URLs).');
await import('./check-workspace-ui.mjs');
