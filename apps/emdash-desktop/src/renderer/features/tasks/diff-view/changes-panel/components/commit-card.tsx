import { CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { githubPanelStore } from '@renderer/features/github-panel/stores/github-panel-store';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { getTaskGitStore } from '@renderer/features/tasks/stores/task-selectors';
import {
  useTaskViewContext,
  useWorkspace,
  useWorkspaceId,
  useWorkspaceViewModel,
} from '@renderer/features/tasks/task-view-context';
import { rpc } from '@renderer/lib/ipc';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { Input } from '@renderer/lib/ui/input';
import { SplitButton, type SplitButtonAction } from '@renderer/lib/ui/split-button';
import { Textarea } from '@renderer/lib/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/lib/ui/tooltip';

type CommitPhase =
  | 'idle'
  | 'committing'
  | 'commit-only-done'
  | 'committed'
  | 'pushing'
  | 'pushed'
  | 'opening-pr';

interface CommitCardProps {
  autoStage?: boolean;
}

export const CommitCard = observer(function CommitCard({ autoStage = false }: CommitCardProps) {
  const { projectId, taskId } = useTaskViewContext();
  const workspaceId = useWorkspaceId();
  const taskView = useWorkspaceViewModel();
  const workspace = useWorkspace();
  const git = workspace.git;
  const diffView = taskView.diffView;
  const changesView = diffView?.changesView ?? null;
  const hasPRs = changesView?.expandedSections.pullRequests ?? false;
  const [commitMessage, setCommitMessage] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<CommitPhase>('idle');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { value: aiGeneration } = useAppSettingsKey('aiGeneration');
  const fullMessage = description ? `${commitMessage}\n\n${description}` : commitMessage;
  const isInFlight = phase !== 'idle';

  const showCreatePrModal = useShowModal('createPrModal');
  const repositoryUrl = workspace.repository.pullRequestRepositoryUrl;

  if (!diffView || !changesView) return null;

  const branchName = getTaskGitStore(projectId, taskId)?.branchName;
  const hasOpenPr = taskView.prStore?.pullRequests.some((p) => p.status === 'open') ?? false;
  const canCreatePr = Boolean(repositoryUrl) && Boolean(branchName) && !hasOpenPr;

  const doGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    const result = await rpc.aiGeneration.generateCommitMessage(projectId, workspaceId);
    if (result.success) {
      setCommitMessage(result.data.title);
      setDescription(result.data.body ?? '');
    } else {
      const errorMessages: Record<string, string> = {
        no_supported_agent: 'No supported agent installed',
        no_diff: 'Nothing to generate from — stage some changes first',
        timeout: 'Generation timed out — try a smaller diff',
        disabled: 'AI generation is disabled',
        not_found: 'Workspace not found',
      };
      const msg =
        'type' in result.error
          ? (errorMessages[result.error.type] ??
            ('message' in result.error ? result.error.message : 'Generation failed'))
          : 'Generation failed';
      setGenerateError(msg);
      setTimeout(() => setGenerateError(null), 4000);
    }
    setIsGenerating(false);
  };

  const doCommit = async () => {
    setPhase('committing');
    if (autoStage) {
      changesView.suppressNextAutoExpand('staged');
      await git.stageAllFiles();
    }
    const result = await git.commit(fullMessage);
    if (!result.success) {
      setPhase('idle');
      return;
    }
    setCommitMessage('');
    setDescription('');
    if (!autoStage) {
      changesView.setExpanded({ unstaged: true, staged: false, pullRequests: hasPRs });
    }
    setPhase('commit-only-done');
    setTimeout(() => setPhase('idle'), 3000);
  };

  const doCommitAndPush = async () => {
    setPhase('committing');
    if (autoStage) {
      changesView.suppressNextAutoExpand('staged');
      await git.stageAllFiles();
    }
    const commitResult = await git.commit(fullMessage);
    if (!commitResult.success) {
      setPhase('idle');
      return;
    }
    setCommitMessage('');
    setDescription('');
    if (!autoStage) {
      changesView.setExpanded({ unstaged: true, staged: false, pullRequests: hasPRs });
    }
    setPhase('committed');
    await new Promise((r) => setTimeout(r, 1000));
    setPhase('pushing');
    const pushResult = await git.push();
    if (!pushResult.success) {
      setPhase('idle');
      return;
    }
    setPhase('pushed');
    setTimeout(() => setPhase('idle'), 3000);
  };

  const doCommitAndCreatePr = async () => {
    setPhase('committing');
    if (autoStage) {
      changesView.suppressNextAutoExpand('staged');
      await git.stageAllFiles();
    }
    const commitResult = await git.commit(fullMessage);
    if (!commitResult.success) {
      setPhase('idle');
      return;
    }
    setCommitMessage('');
    setDescription('');
    if (!autoStage) {
      changesView.setExpanded({ unstaged: true, staged: false, pullRequests: hasPRs });
    }
    setPhase('opening-pr');
    await new Promise((r) => setTimeout(r, 500));
    setPhase('idle');
    showCreatePrModal({
      projectId,
      taskId,
      repositoryUrl: repositoryUrl ?? '',
      branchName: branchName ?? '',
      draft: false,
      workspaceId,
      onSuccess: () => githubPanelStore.myPrs.invalidate(),
    });
  };

  const actions: SplitButtonAction[] = [
    { value: 'commit', label: 'Commit', action: () => void doCommit() },
    { value: 'commit-push', label: 'Commit & Push', action: () => void doCommitAndPush() },
    ...(canCreatePr
      ? [
          {
            value: 'commit-pr',
            label: 'Commit & Create PR',
            action: () => void doCommitAndCreatePr(),
          },
        ]
      : []),
  ];

  const effectiveAction =
    diffView.effectiveCommitAction === 'commit-pr' && !canCreatePr
      ? 'commit-push'
      : diffView.effectiveCommitAction;

  const showGenerateButton = aiGeneration?.enabled ?? true;

  return (
    <div className="mx-2 mb-2 flex shrink-0 flex-col items-center justify-between gap-2 rounded-xl border border-border bg-background-1 p-2">
      <div className="flex w-full items-center gap-1">
        <Input
          placeholder="Commit message"
          autoFocus
          className="w-full bg-background"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          disabled={isInFlight || isGenerating}
        />
        {showGenerateButton && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  disabled={isInFlight || isGenerating}
                  onClick={() => void doGenerate()}
                  aria-label="Generate commit message with AI"
                >
                  {isGenerating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate commit message with AI</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <Textarea
        placeholder="Description"
        className="w-full bg-background"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isInFlight || isGenerating}
      />
      {generateError && (
        <p className="w-full text-xs text-foreground-destructive">{generateError}</p>
      )}
      {phase === 'idle' && (
        <SplitButton
          actions={actions}
          size="sm"
          className="w-full"
          disabled={!commitMessage.trim()}
          defaultValue={effectiveAction}
          onValueChange={(value) =>
            diffView.setCommitAction(value as 'commit' | 'commit-push' | 'commit-pr')
          }
        />
      )}
      {phase === 'committing' && (
        <StatusRow icon={<Loader2 className="size-4 animate-spin" />} label="Committing…" />
      )}
      {phase === 'opening-pr' && (
        <StatusRow icon={<Loader2 className="size-4 animate-spin" />} label="Opening PR…" />
      )}
      {(phase === 'commit-only-done' || phase === 'committed') && (
        <StatusRow
          icon={<CheckCircle className="size-4 text-foreground-success" />}
          label="Committed"
        />
      )}
      {phase === 'pushing' && (
        <StatusRow icon={<Loader2 className="size-4 animate-spin" />} label="Pushing…" />
      )}
      {phase === 'pushed' && (
        <StatusRow
          icon={<CheckCircle className="size-4 text-foreground-success" />}
          label="Pushed"
        />
      )}
    </div>
  );
});

function StatusRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-2 py-1 text-sm text-foreground-muted">
      {icon}
      <span>{label}</span>
    </div>
  );
}
