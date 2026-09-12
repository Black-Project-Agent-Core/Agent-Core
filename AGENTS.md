# Capability inventory maintenance

For capability comparison or changes in this repository, first read [docs/AGENT-CORE-CAPABILITIES.md](docs/AGENT-CORE-CAPABILITIES.md). Use its source map to inspect the relevant implementation and tests; expand inspection only when the mapped scope is insufficient.

When adding, changing, or removing a capability, update the same inventory's affected entries and change record in the same task. Record purpose, activation, configuration, source evidence, verification scope, and limitations. Preserve stable capability IDs. Keep proposed work separate from implemented behavior.

Do not infer runtime health or end-to-end acceptance from documentation, tool registration, or a feature flag alone. Label dated observations and recheck the affected evidence when its source, schema, configuration, or runtime changes.

This file governs ordinary project documentation. It does not change the user's central memory bootstrap, authorize persistent assistant-memory writes, or introduce a runtime requirement.
