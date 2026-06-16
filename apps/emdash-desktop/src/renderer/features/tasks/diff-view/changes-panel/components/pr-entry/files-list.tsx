import { observer } from 'mobx-react-lite';
import { usePrefetchDiffModels } from '@renderer/features/tasks/diff-view/changes-panel/hooks/use-prefetch-diff-models';
import {
  useTaskViewContext,
  useWorkspaceId,
  useWorkspaceViewModel,
} from '@renderer/features/tasks/task-view-context';
import { commitRef, refsEqual, type GitChange } from '@shared/core/git/git';
import { getPrNumber, type PullRequest } from '@shared/core/pull-requests/pull-requests';
import { useDiffTabTarget } from '../../diff-tab-target';
import { useChangesViewMode } from '../../hooks/use-changes-view-mode';
import { ChangesListOrTree } from '../changes-list-or-tree';

export const PrFilesList = observer(function PrFilesList({ pr }: { pr: PullRequest }) {
  const { projectId, taskId } = useTaskViewContext();
  const workspaceId = useWorkspaceId();
  const taskView = useWorkspaceViewModel();
  const prStore = taskView.prStore!;
  const { mode: viewMode } = useChangesViewMode('pr');

  const tabTargetOverride = useDiffTabTarget();
  const tabManager = tabTargetOverride ?? taskView.tabManager;
  const diffSource = tabTargetOverride
    ? { sourceProjectId: projectId, sourceTaskId: taskId }
    : undefined;

  const prNumber = getPrNumber(pr) ?? undefined;
  const baseRef = commitRef(pr.baseRefOid);
  const modifiedRef = commitRef(pr.headRefOid);
  const prFiles = prStore.getFiles(pr).data ?? [];

  const prefetchPrDiff = usePrefetchDiffModels(projectId, workspaceId, 'pr', baseRef, modifiedRef);

  const activePath =
    tabManager.activeDescriptor?.kind === 'diff' &&
    tabManager.activeDescriptor.diffGroup === 'pr' &&
    tabManager.activeDescriptor.prNumber === prNumber &&
    refsEqual(tabManager.activeDescriptor.originalRef, baseRef) &&
    refsEqual(tabManager.activeDescriptor.modifiedRef ?? modifiedRef, modifiedRef)
      ? tabManager.activeDescriptor.path
      : undefined;

  const handleSelectChange = (change: GitChange) => {
    tabManager.openDiffPreview(
      {
        path: change.path,
        type: 'git',
        group: 'pr',
        originalRef: baseRef,
        modifiedRef,
        prNumber,
        prBaseOid: pr.baseRefOid,
        prHeadOid: pr.headRefOid,
        ...diffSource,
      },
      change.status
    );
  };

  const handleDoubleClickChange = (change: GitChange) => {
    tabManager.openDiff(
      {
        path: change.path,
        type: 'git',
        group: 'pr',
        originalRef: baseRef,
        modifiedRef,
        prNumber,
        prBaseOid: pr.baseRefOid,
        prHeadOid: pr.headRefOid,
        ...diffSource,
      },
      change.status
    );
  };

  return (
    <ChangesListOrTree
      viewMode={viewMode}
      className="py-3"
      changes={prFiles}
      activePath={activePath}
      onSelectChange={handleSelectChange}
      onDoubleClickChange={handleDoubleClickChange}
      onPrefetch={(change) => prefetchPrDiff(change.path)}
    />
  );
});
