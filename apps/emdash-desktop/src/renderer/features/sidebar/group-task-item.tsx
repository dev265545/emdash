import { Loader2, SquareDashed } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { getRepoGroupStore } from '@renderer/features/repo-groups/stores/repo-group-selectors';
import {
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { cn } from '@renderer/utils/utils';
import { SidebarMenuAction, SidebarMenuRow } from './sidebar-primitives';

const STATUS_COLOR: Record<string, string> = {
  todo: 'text-foreground-muted',
  in_progress: 'text-blue-500',
  review: 'text-yellow-500',
  done: 'text-green-500',
  cancelled: 'text-foreground-tertiary-muted',
  backlog: 'text-foreground-muted',
};

export const SidebarGroupTaskItem = observer(function SidebarGroupTaskItem({
  repoGroupId,
  groupTaskId,
}: {
  repoGroupId: string;
  groupTaskId: string;
}) {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { params: taskParams } = useParams('task');
  const showManage = useShowModal('manageGroupTaskModal');

  const group = getRepoGroupStore(repoGroupId);
  const task = group?.groupTasks.get(groupTaskId);
  if (!group || !task) return null;

  const primaryProjectId = group.data.memberProjectIds[0];
  const ready = task.hasWorkspace && !!task.agentTaskId && !!primaryProjectId;
  const isActive = currentView === 'task' && taskParams.taskId === task.agentTaskId;

  const handleClick = () => {
    if (ready) {
      navigate('task', { projectId: primaryProjectId!, taskId: task.agentTaskId! });
    } else {
      showManage({ groupTaskId, repoGroupId });
    }
  };

  return (
    <SidebarMenuRow
      className={cn('group/row h-8 flex items-center gap-1.5 pr-2 pl-7')}
      data-active={isActive || undefined}
      isActive={isActive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
    >
      {ready ? (
        <SquareDashed
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            STATUS_COLOR[task.rollupStatus] ?? 'text-foreground-muted'
          )}
        />
      ) : (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground-tertiary-muted" />
      )}
      <SidebarMenuAction className="min-w-0 flex-1 truncate select-none">
        <span className="truncate">{task.data.name}</span>
      </SidebarMenuAction>
      {!ready && (
        <span className="shrink-0 text-[10px] text-foreground-tertiary-muted">setting up…</span>
      )}
    </SidebarMenuRow>
  );
});
