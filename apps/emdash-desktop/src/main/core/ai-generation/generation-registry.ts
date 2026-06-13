import type { AgentModelOption, SupportedGenerationAgent } from '@shared/ai-generation';

type AgentGenerationConfig = {
  name: string;
  buildArgs: (prompt: string, model: string) => string[];
  models: AgentModelOption[];
  supportsModelFlag: boolean;
};

const GENERATION_REGISTRY: Record<string, AgentGenerationConfig> = {
  claude: {
    name: 'Claude Code',
    buildArgs: (prompt, model) => {
      const args = ['--print'];
      if (model !== 'auto') args.push('--model', model);
      args.push(prompt);
      return args;
    },
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest, cheapest', isDefault: true },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced', isDefault: false },
      { id: 'claude-opus-4-8', label: 'Opus 4.8 — highest quality', isDefault: false },
    ],
    supportsModelFlag: true,
  },
  codex: {
    name: 'Codex',
    buildArgs: (prompt, model) => {
      const args = ['-q'];
      if (model !== 'auto') args.push('--model', model);
      args.push(prompt);
      return args;
    },
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini — fastest, cheapest', isDefault: true },
      { id: 'gpt-4o', label: 'GPT-4o — balanced', isDefault: false },
      { id: 'o4-mini', label: 'o4 Mini — reasoning', isDefault: false },
      { id: 'o3', label: 'o3 — highest quality', isDefault: false },
    ],
    supportsModelFlag: true,
  },
  opencode: {
    name: 'OpenCode',
    buildArgs: (prompt, model) => {
      const args = ['run', '--print'];
      if (model !== 'auto') args.push('--model', model);
      args.push(prompt);
      return args;
    },
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini — fastest, cheapest', isDefault: true },
      { id: 'gpt-4o', label: 'GPT-4o — balanced', isDefault: false },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', isDefault: false },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', isDefault: false },
    ],
    supportsModelFlag: true,
  },
  gemini: {
    name: 'Gemini',
    buildArgs: (prompt, model) => {
      const args = ['--non-interactive', '-i', prompt];
      if (model !== 'auto') args.push('--model', model);
      return args;
    },
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fastest, cheapest', isDefault: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — balanced', isDefault: false },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — highest quality', isDefault: false },
    ],
    supportsModelFlag: true,
  },
  qwen: {
    name: 'Qwen',
    buildArgs: (prompt, model) => {
      const args = ['-i', prompt, '--yolo'];
      if (model !== 'auto') args.push('--model', model);
      return args;
    },
    models: [
      { id: 'qwen-plus', label: 'Qwen Plus — balanced', isDefault: true },
      { id: 'qwen-max', label: 'Qwen Max — highest quality', isDefault: false },
      { id: 'qwen-turbo', label: 'Qwen Turbo — fastest', isDefault: false },
    ],
    supportsModelFlag: true,
  },
  copilot: {
    name: 'Copilot',
    buildArgs: (prompt) => ['-i', prompt],
    models: [],
    supportsModelFlag: false,
  },
  goose: {
    name: 'Goose',
    buildArgs: (prompt) => ['run', '-t', prompt],
    models: [],
    supportsModelFlag: false,
  },
  kilocode: {
    name: 'Kilo Code',
    buildArgs: (prompt) => [prompt, '--yolo'],
    models: [],
    supportsModelFlag: false,
  },
  auggie: {
    name: 'Auggie',
    buildArgs: (prompt) => ['-p', prompt, '--headless'],
    models: [],
    supportsModelFlag: false,
  },
};

export const SUPPORTED_AGENT_IDS: string[] = [
  'claude',
  'opencode',
  'gemini',
  'codex',
  'qwen',
  'copilot',
  'goose',
  'kilocode',
  'auggie',
];

export function getAgentConfig(agentId: string): AgentGenerationConfig | undefined {
  return GENERATION_REGISTRY[agentId];
}

export function getModelsForAgent(agentId: string): AgentModelOption[] {
  return GENERATION_REGISTRY[agentId]?.models ?? [];
}

export function resolveDefaultModel(agentId: string): string {
  const models = getModelsForAgent(agentId);
  return models.find((m) => m.isDefault)?.id ?? 'auto';
}

export function buildSupportedAgentInfo(agentId: string): SupportedGenerationAgent | undefined {
  const cfg = GENERATION_REGISTRY[agentId];
  if (!cfg) return undefined;
  return {
    agentId,
    name: cfg.name,
    models: cfg.models,
    supportsModelFlag: cfg.supportsModelFlag,
  };
}
