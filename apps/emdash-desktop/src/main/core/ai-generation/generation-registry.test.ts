import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_AGENT_IDS,
  buildSupportedAgentInfo,
  getAgentConfig,
  getModelsForAgent,
  resolveDefaultModel,
} from './generation-registry';

describe('generation-registry', () => {
  describe('SUPPORTED_AGENT_IDS', () => {
    it('includes claude as first priority', () => {
      expect(SUPPORTED_AGENT_IDS[0]).toBe('claude');
    });

    it('has no duplicates', () => {
      expect(new Set(SUPPORTED_AGENT_IDS).size).toBe(SUPPORTED_AGENT_IDS.length);
    });
  });

  describe('getAgentConfig', () => {
    it('returns config for claude', () => {
      const cfg = getAgentConfig('claude');
      expect(cfg).toBeDefined();
      expect(cfg?.name).toBe('Claude Code');
    });

    it('returns undefined for unknown agent', () => {
      expect(getAgentConfig('nonexistent')).toBeUndefined();
    });

    it('claude buildArgs includes --print flag', () => {
      const cfg = getAgentConfig('claude');
      const args = cfg?.buildArgs('hello', 'auto');
      expect(args).toContain('--print');
    });

    it('claude buildArgs includes --model when model is not auto', () => {
      const cfg = getAgentConfig('claude');
      const args = cfg?.buildArgs('prompt', 'claude-opus-4-8');
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-8');
    });

    it('claude buildArgs omits --model when model is auto', () => {
      const cfg = getAgentConfig('claude');
      const args = cfg?.buildArgs('prompt', 'auto');
      expect(args).not.toContain('--model');
    });

    it('codex buildArgs includes -q flag', () => {
      const cfg = getAgentConfig('codex');
      const args = cfg?.buildArgs('hello', 'auto');
      expect(args).toContain('-q');
    });

    it('gemini buildArgs includes --non-interactive', () => {
      const cfg = getAgentConfig('gemini');
      const args = cfg?.buildArgs('prompt', 'auto');
      expect(args).toContain('--non-interactive');
    });
  });

  describe('getModelsForAgent', () => {
    it('returns models for claude', () => {
      const models = getModelsForAgent('claude');
      expect(models.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown agent', () => {
      expect(getModelsForAgent('nonexistent')).toEqual([]);
    });

    it('exactly one model is default per agent', () => {
      for (const agentId of SUPPORTED_AGENT_IDS) {
        const models = getModelsForAgent(agentId);
        if (models.length === 0) continue;
        const defaults = models.filter((m) => m.isDefault);
        expect(defaults.length).toBe(1);
      }
    });
  });

  describe('resolveDefaultModel', () => {
    it('returns haiku for claude', () => {
      expect(resolveDefaultModel('claude')).toBe('claude-haiku-4-5-20251001');
    });

    it('returns gpt-4o-mini for codex', () => {
      expect(resolveDefaultModel('codex')).toBe('gpt-4o-mini');
    });

    it('returns gemini-2.0-flash for gemini', () => {
      expect(resolveDefaultModel('gemini')).toBe('gemini-2.0-flash');
    });

    it('returns auto for unknown agent', () => {
      expect(resolveDefaultModel('unknown')).toBe('auto');
    });
  });

  describe('buildSupportedAgentInfo', () => {
    it('returns correct shape for claude', () => {
      const info = buildSupportedAgentInfo('claude');
      expect(info).toBeDefined();
      expect(info?.agentId).toBe('claude');
      expect(info?.name).toBe('Claude Code');
      expect(info?.supportsModelFlag).toBe(true);
      expect(Array.isArray(info?.models)).toBe(true);
    });

    it('returns correct shape for goose (no model flag)', () => {
      const info = buildSupportedAgentInfo('goose');
      expect(info).toBeDefined();
      expect(info?.supportsModelFlag).toBe(false);
      expect(info?.models).toHaveLength(0);
    });

    it('returns undefined for unknown agent', () => {
      expect(buildSupportedAgentInfo('nonexistent')).toBeUndefined();
    });
  });
});
