import { Loader2, MessageSquare } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type ReactNode } from 'react';
import { getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import {
  getGroupContextForAgentTask,
  getRepoGroupStore,
} from '@renderer/features/repo-groups/stores/repo-group-selectors';
import { ChangesPanel } from '@renderer/features/tasks/diff-view/changes-panel/changes-panel';
import { TaskMainPanel } from '@renderer/features/tasks/main-panel';
import {
  getTaskManagerStore,
  getTaskStore,
  taskViewKind,
} from '@renderer/features/tasks/stores/task-selectors';
import { TaskViewWrapper, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import {
  DraggableResizeHandle,
  TaskMainColumn,
} from '@renderer/features/tasks/view/task-main-column';
import { TaskSidebar } from '@renderer/features/tasks/view/task-sidebar';
import { ResizablePanel, ResizablePanelGroup } from '@renderer/lib/ui/resizable';
import { cn } from '@renderer/utils/utils';

const AGENT_TAB = 'agent';

type Member = { projectId: string; worktreePath: string | null; taskId: string };

/**
 * Main panel for a group task's shared agent, modelled on VS Code multi-root
 * source control. The center shows the active context's main column (the agent
 * conversation, or a repo's diff viewer); the right panel has a repo tab strip
 * — [ Agent | repo1 | repo2 … ] — and the selected repo's real ChangesPanel.
 * Clicking a changed file opens its diff in the center, reusing the standard
 * single-repo components per repo. Pass-through to TaskMainPanel for non-group
 * tasks.
 */
export const GroupTaskMainPanel = observer(function GroupTaskMainPanel() {
  const { taskId } = useTaskViewContext();
  const groupContext = getGroupContextForAgentTask(taskId);
  const group = groupContext ? getRepoGroupStore(groupContext.repoGroupId) : undefined;
  const groupTask = group?.groupTasks.get(groupContext?.groupTaskId ?? '');
  const members = (groupTask?.data.members ?? []).filter((m): m is Member => !!m.taskId);

  const [activeTab, setActiveTab] = useState<string>(AGENT_TAB);

  if (!groupContext || members.length === 0) {
    return <TaskMainPanel />;
  }

  const activeMember = members.find((m) => m.taskId === activeTab) ?? null;

  return (
    <ResizablePanelGroup orientation="horizontal" id="group-task-layout">
      <ResizablePanel id="group-task-center">
        {activeMember ? (
          <MemberRegion projectId={activeMember.projectId} taskId={activeMember.taskId}>
            <TaskMainColumn />
          </MemberRegion>
        ) : (
          <TaskMainColumn />
        )}
      </ResizablePanel>
      <DraggableResizeHandle />
      <ResizablePanel id="group-task-sidebar" defaultSize="28%" minSize="280px" maxSize="55%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1">
            <TabButton
              active={activeTab === AGENT_TAB}
              onClick={() => setActiveTab(AGENT_TAB)}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Agent"
            />
            {members.map((m) => (
              <TabButton
                key={m.taskId}
                active={activeTab === m.taskId}
                onClick={() => setActiveTab(m.taskId)}
                label={getProjectStore(m.projectId)?.name ?? m.projectId}
              />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {activeMember ? (
              <MemberRegion projectId={activeMember.projectId} taskId={activeMember.taskId}>
                <ChangesPanel />
              </MemberRegion>
            ) : (
              <TaskSidebar />
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-foreground-tertiary-muted hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {icon}
      <span className="max-w-40 truncate">{label}</span>
    </button>
  );
}

/**
 * Provides a member repo's diff-only child task as the task-view context and
 * provisions it on demand, so the standard task components (TaskMainColumn,
 * ChangesPanel) operate on that repo's worktree. Shows a spinner until ready.
 */
const MemberRegion = observer(function MemberRegion({
  projectId,
  taskId,
  children,
}: {
  projectId: string;
  taskId: string;
  children: ReactNode;
}) {
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);

  useEffect(() => {
    if (kind !== 'idle') return;
    getTaskManagerStore(projectId)
      ?.provisionTask(taskId)
      .catch(() => {});
  }, [kind, projectId, taskId]);

  return (
    <TaskViewWrapper projectId={projectId} taskId={taskId}>
      {kind === 'ready' ? (
        children
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-foreground-muted" />
        </div>
      )}
    </TaskViewWrapper>
  );
});
