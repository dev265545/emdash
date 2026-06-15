import { Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type ReactNode } from 'react';
import { getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import {
  getGroupContextForAgentTask,
  getRepoGroupStore,
} from '@renderer/features/repo-groups/stores/repo-group-selectors';
import { ChangesPanel } from '@renderer/features/tasks/diff-view/changes-panel/changes-panel';
import { DiffTabTargetContext } from '@renderer/features/tasks/diff-view/changes-panel/diff-tab-target';
import { TaskMainPanel } from '@renderer/features/tasks/main-panel';
import {
  getTaskManagerStore,
  getTaskStore,
  getWorkspaceViewModel,
  taskViewKind,
} from '@renderer/features/tasks/stores/task-selectors';
import {
  TaskViewWrapper,
  useTaskViewContext,
  useWorkspaceViewModel,
} from '@renderer/features/tasks/task-view-context';
import {
  DraggableResizeHandle,
  TaskMainColumn,
} from '@renderer/features/tasks/view/task-main-column';
import { ResizablePanel, ResizablePanelGroup } from '@renderer/lib/ui/resizable';
import { cn } from '@renderer/utils/utils';

type Member = { projectId: string; worktreePath: string | null; taskId: string };

/**
 * Main panel for a group task's shared agent, modelled on VS Code multi-root
 * source control. The center is the agent task's own TaskMainColumn at all
 * times — so the agent conversation, terminal, and tab strip are never torn
 * down. Opening a changed file from any repo's sidebar ChangesPanel adds a diff
 * tab to that SAME agent tab strip (via DiffTabTargetContext), and PaneContent
 * renders each such diff under its source repo's git context. The right panel
 * is a repo tab strip — [ repo1 | repo2 … ] — showing the selected repo's real
 * ChangesPanel. Pass-through to TaskMainPanel for non-group tasks.
 */
export const GroupTaskMainPanel = observer(function GroupTaskMainPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const kind = taskViewKind(getTaskStore(projectId, taskId), projectId);
  const groupContext = getGroupContextForAgentTask(taskId);
  const group = groupContext ? getRepoGroupStore(groupContext.repoGroupId) : undefined;
  const groupTask = group?.groupTasks.get(groupContext?.groupTaskId ?? '');
  const members = (groupTask?.data.members ?? []).filter((m): m is Member => !!m.taskId);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (!groupContext || members.length === 0) {
    return <TaskMainPanel />;
  }

  // The center mounts TaskMainColumn (and its TerminalsPanel) against the agent
  // task's workspace, which only exists once provisioned. Defer to
  // TaskMainPanel's loader/error states until ready — otherwise useWorkspaceId()
  // throws "task has no workspace" mid-provision.
  if (kind !== 'ready') {
    return <TaskMainPanel />;
  }

  const activeMember = members.find((m) => m.taskId === activeTab) ?? members[0];
  if (!activeMember) {
    return <TaskMainPanel />;
  }

  // Repo diffs open into the agent's tab strip, not the member's hidden one.
  const agentTabManager = getWorkspaceViewModel(projectId, taskId)?.tabManager ?? null;

  return (
    <ResizablePanelGroup orientation="horizontal" id="group-task-layout">
      <ResizablePanel id="group-task-center">
        <TaskMainColumn />
      </ResizablePanel>
      <DraggableResizeHandle />
      <ResizablePanel id="group-task-sidebar" defaultSize="28%" minSize="280px" maxSize="55%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1">
            {members.map((m) => (
              <TabButton
                key={m.taskId}
                active={activeMember.taskId === m.taskId}
                onClick={() => setActiveTab(m.taskId)}
                label={getProjectStore(m.projectId)?.name ?? m.projectId}
              />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <DiffTabTargetContext.Provider value={agentTabManager}>
              <MemberRegion
                key={activeMember.taskId}
                projectId={activeMember.projectId}
                taskId={activeMember.taskId}
              >
                <RepoChangesPanel />
              </MemberRegion>
            </DiffTabTargetContext.Provider>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

/**
 * The member repo's ChangesPanel. usePanelLayout only applies its
 * collapsed/expanded section sizing when the task view reports the changes
 * panel as visible, so force this diff-only member into that state (it has no
 * other sidebar surface).
 */
const RepoChangesPanel = observer(function RepoChangesPanel() {
  const taskView = useWorkspaceViewModel();

  useEffect(() => {
    taskView.setSidebarTab('changes');
    taskView.setSidebarCollapsed(false);
  }, [taskView]);

  return <ChangesPanel />;
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
