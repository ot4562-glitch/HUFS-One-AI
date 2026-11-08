/** Standalone exports. Wiring into API / UI / AI is owned by the receiving teams. */
export * from './eligibility.js';
export * from './recommendations.js';
export * from './discovery.js';

// Domain v2: reviewed source-aware, policy and evidence-driven cores.
export * from './source-policy.js';
export * from './scholarships-v2.js';
export * from './mentors-v2.js';
export * from './counseling-v2.js';
export * from './recognition-v2.js';
export * from './skills-v2.js';
// #347 code-based requirement↔experience link candidates (no model call).
export * from './skills-semantic.js';
export * from './catalog-v2.js';
export * from './badges-v2.js';
export * from './learning-v2.js';
export * from './employment-v2.js';
export * from './international-v2.js';
// Owner-safe follow-up recommendation planning; not an issuer decision.
export * from './action-planner.js';
