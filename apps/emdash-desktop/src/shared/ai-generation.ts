export type GenerationError =
  | { type: 'no_supported_agent' }
  | { type: 'cli_not_found'; agentId: string }
  | { type: 'cli_error'; agentId: string; message: string }
  | { type: 'no_diff' }
  | { type: 'timeout'; agentId: string }
  | { type: 'disabled' }
  | { type: 'not_found' };

export type GenerationResult = {
  title: string;
  body?: string;
};

export type AgentModelOption = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type SupportedGenerationAgent = {
  agentId: string;
  name: string;
  models: AgentModelOption[];
  supportsModelFlag: boolean;
};
