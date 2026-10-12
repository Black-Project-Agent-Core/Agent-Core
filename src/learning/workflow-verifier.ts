// The host and experience engine must replay against one trusted oracle registry.
// Registration remains host-only; the shared verifier still checks exact task/source bytes.
export {
  WORKFLOW_VERIFIER_REVISION,
  registerWorkflowVerification,
  verifyWorkflowAnswer,
  recheckWorkflowReport,
  type WorkflowVerificationManifest,
  type WorkflowCase,
} from '../../SubProject/agent-core-memory/dist/learning/workflow-verifier.js';
