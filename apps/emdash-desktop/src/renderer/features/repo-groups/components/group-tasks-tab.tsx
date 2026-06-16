import { CheckSquare, Plus, SquareDashed, Zap } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useEffect } from 'react';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { cn } from '@renderer/utils/utils';
import type { GroupTaskStore } from '../stores/group-task-store';
import { getRepoGroupStore } from '../stores/repo-group-selectors';

const STATUS_LABEL: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
  backlog: 'Backlog',
  triage: 'Triage',
  duplicate: 'Duplicate',
};

const STATUS_COLOR: Record<string, string> = {
  todo: 'text-foreground-muted',
  in_progress: 'text-blue-500',
  review: 'text-yellow-500',
  done: 'text-green-500',
  cancelled: 'text-foreground-tertiary-muted line-through',
  backlog: 'text-foreground-muted',
  triage: 'text-orange-400',
  duplicate: 'text-foreground-tertiary-muted',
};

function GroupTaskRow({ task, repoGroupId }: { task: GroupTaskStore; repoGroupId: string }) {
  const showManage = useShowModal('manageGroupTaskModal');
  const { navigate } = useNavigate();
  if (task.isArchived) return null;

  const group = getRepoGroupStore(repoGroupId);
  const primaryProjectId = group?.data.memberProjectIds[0];
  const canNavigate = task.hasWorkspace && !!primaryProjectId && !!task.agentTaskId;

  const handleClick = () => {
    if (canNavigate) {
      navigate('task', { projectId: primaryProjectId!, taskId: task.agentTaskId! });
    } else {
      showManage({ groupTaskId: task.data.id, repoGroupId });
    }
  };

  return (
    <div
      className="hover:bg-accent/50 flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm"
      onClick={handleClick}
    >
      <SquareDashed
        className={cn(
          'h-4 w-4 shrink-0',
          STATUS_COLOR[task.rollupStatus] ?? 'text-foreground-muted'
        )}
      />
      <span className="min-w-0 flex-1 truncate">{task.data.name}</span>
      {canNavigate && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-blue-500">
          <Zap className="h-3 w-3" />
          Open Agent
        </span>
      )}
      <span className={cn('shrink-0 text-xs', STATUS_COLOR[task.rollupStatus] ?? '')}>
        {STATUS_LABEL[task.rollupStatus] ?? task.rollupStatus}
      </span>
    </div>
  );
}

export const GroupTasksTab = observer(function GroupTasksTab({
  repoGroupId,
}: {
  repoGroupId: string;
}) {
  const group = getRepoGroupStore(repoGroupId);
  const showCreate = useShowModal('createGroupTaskModal');

  useEffect(() => {
    if (group) {
      void group.loadGroupTasks();
    }
  }, [group]);

  if (!group) return null;

  const activeTasks = Array.from(group.groupTasks.values()).filter((t) => !t.isArchived);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium text-foreground-tertiary-muted">
          {activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''}
        </span>
        <Button
          size="xs"
          variant="ghost"
          className="gap-1.5 text-xs"
          onClick={() => showCreate({ repoGroupId })}
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Button>
      </div>
      {activeTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-foreground-tertiary-muted">
          <CheckSquare className="h-8 w-8 opacity-30" />
          <p className="text-sm">No tasks yet</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => showCreate({ repoGroupId })}
          >
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {activeTasks.map((task) => (
            <GroupTaskRow key={task.data.id} task={task} repoGroupId={repoGroupId} />
          ))}
        </div>
      )}
    </div>
  );
});
