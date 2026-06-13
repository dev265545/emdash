import React, { useCallback, useEffect, useState } from 'react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { rpc } from '@renderer/lib/ipc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { Switch } from '@renderer/lib/ui/switch';
import type { SupportedGenerationAgent } from '@shared/ai-generation';
import { SettingRow } from './SettingRow';

const AiGenerationSettingsCard: React.FC = () => {
  const { value: aiGeneration, update, isLoading, isSaving } = useAppSettingsKey('aiGeneration');

  const [availableAgents, setAvailableAgents] = useState<SupportedGenerationAgent[]>([]);

  useEffect(() => {
    void rpc.aiGeneration.getAvailableGenerationAgents().then((result) => {
      if (result.success) setAvailableAgents(result.data);
    });
  }, []);

  const enabled = aiGeneration?.enabled ?? true;
  const agentId = aiGeneration?.agentId ?? 'auto';
  const commitModel = aiGeneration?.commitModel ?? 'auto';
  const prModel = aiGeneration?.prModel ?? 'auto';

  const selectedAgent = availableAgents.find((a) => a.agentId === agentId) ?? null;
  const modelsForAgent = selectedAgent?.models ?? [];
  const showModelPickers = selectedAgent?.supportsModelFlag ?? false;

  const toggleEnabled = useCallback((next: boolean) => update({ enabled: next }), [update]);

  const handleAgentChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      update({ agentId: value, commitModel: 'auto', prModel: 'auto' });
    },
    [update]
  );

  const handleCommitModelChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      update({ commitModel: value });
    },
    [update]
  );

  const handlePrModelChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      update({ prModel: value });
    },
    [update]
  );

  const isDisabled = isLoading || isSaving;

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        title="Enable AI generation"
        description="Adds Generate buttons to the commit and PR creation flows."
        control={<Switch checked={enabled} disabled={isDisabled} onCheckedChange={toggleEnabled} />}
      />

      <SettingRow
        title="Agent"
        description="Which agent CLI to use for generation. Only installed agents are shown."
        control={
          <Select
            value={agentId}
            onValueChange={handleAgentChange}
            disabled={isDisabled || !enabled}
          >
            <SelectTrigger className="w-[183px]">
              <SelectValue placeholder="Auto-detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              {availableAgents.map((agent) => (
                <SelectItem key={agent.agentId} value={agent.agentId}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {showModelPickers && (
        <>
          <SettingRow
            title="Commit message model"
            description="Model used when generating commit messages."
            control={
              <Select
                value={commitModel}
                onValueChange={handleCommitModelChange}
                disabled={isDisabled || !enabled}
              >
                <SelectTrigger className="w-[183px]">
                  <SelectValue placeholder="Default (cheapest)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Default (cheapest)</SelectItem>
                  {modelsForAgent.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <SettingRow
            title="PR description model"
            description="Model used when generating PR descriptions."
            control={
              <Select
                value={prModel}
                onValueChange={handlePrModelChange}
                disabled={isDisabled || !enabled}
              >
                <SelectTrigger className="w-[183px]">
                  <SelectValue placeholder="Default (cheapest)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Default (cheapest)</SelectItem>
                  {modelsForAgent.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </>
      )}
    </div>
  );
};

export default AiGenerationSettingsCard;
