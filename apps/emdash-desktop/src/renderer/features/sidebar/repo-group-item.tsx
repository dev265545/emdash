import { ChevronRight, Layers, Plus, Settings, Trash2, TriangleAlert } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { getRepoGroupStore } from '@renderer/features/repo-groups/stores/repo-group-selectors';
import { useNavigate, useWorkspaceSlots } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { appState, sidebarStore } from '@renderer/lib/stores/app-state';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/lib/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { SidebarItemMiniButton, SidebarMenuAction, SidebarMenuRow } from './sidebar-primitives';

export const SidebarRepoGroupItem = observer(function SidebarRepoGroupItem({
  repoGroupId,
}: {
  repoGroupId: string;
}) {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const showManageModal = useShowModal('manageRepoGroupModal');
  const showCreateTaskModal = useShowModal('createGroupTaskModal');
  const showConfirm = useShowModal('confirmActionModal');

  const group = getRepoGroupStore(repoGroupId);
  if (!group) return null;

  const isExpanded = sidebarStore.expandedGroupIds.has(repoGroupId);
  const isActive = currentView === 'repoGroup';
  const memberCount = group.data.memberProjectIds.length;
  const label = group.data.name;

  const openGroup = () => navigate('repoGroup', { repoGroupId });

  const handleNewTask = () => {
    sidebarStore.ensureGroupExpanded(repoGroupId);
    showCreateTaskModal({ repoGroupId });
  };

  const handleDelete = () => {
    showConfirm({
      title: 'Remove Workspace',
      description: `Remove "${label}"? Member projects and their tasks are not affected.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onSuccess: async () => {
        await appState.repoGroups.deleteGroup(repoGroupId);
        if (isActive) navigate('home');
      },
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <SidebarMenuRow
          className={cn('group/row h-8 justify-between flex px-1')}
          data-active={isActive || undefined}
          isActive={isActive}
          onMouseDown={(e) => e.preventDefault()}
          onClick={openGroup}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <SidebarItemMiniButton
              type="button"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}`}
              className="relative"
              onClick={(e) => {
                e.stopPropagation();
                sidebarStore.toggleGroupExpanded(repoGroupId);
              }}
            >
              <Layers className="absolute h-4 w-4 opacity-100 transition-opacity duration-150 group-hover/row:opacity-0" />
              <ChevronRight
                className={cn(
                  'absolute h-4 w-4 transition-all duration-150 opacity-0 group-hover/row:opacity-100',
                  isExpanded && 'rotate-90'
                )}
              />
            </SidebarItemMiniButton>
            <SidebarMenuAction
              aria-label={`Open workspace ${label}`}
              className="truncate transition-colors select-none"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{label}</span>
                <span className="shrink-0 text-xs text-foreground-tertiary-muted">
                  {memberCount}
                </span>
                {group.hasUnhealthyMember && (
                  <Tooltip>
                    <TooltipTrigger>
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-foreground-destructive" />
                    </TooltipTrigger>
                    <TooltipContent>One or more repos are unavailable</TooltipContent>
                  </Tooltip>
                )}
              </span>
            </SidebarMenuAction>
          </div>
          <Tooltip>
            <TooltipTrigger
              className="h-6"
              render={
                <SidebarItemMiniButton
                  type="button"
                  aria-label={`New task in ${label}`}
                  className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNewTask();
                  }}
                >
                  <Plus className="h-4 w-4" />
                </SidebarItemMiniButton>
              }
            />
            <TooltipContent>New Task</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              className="h-6"
              render={
                <SidebarItemMiniButton
                  type="button"
                  aria-label={`Workspace settings for ${label}`}
                  className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    showManageModal({ repoGroupId });
                  }}
                >
                  <Settings className="h-4 w-4" />
                </SidebarItemMiniButton>
              }
            />
            <TooltipContent>Workspace Settings</TooltipContent>
          </Tooltip>
        </SidebarMenuRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={openGroup}>
          <Layers className="size-4" />
          Open Workspace
        </ContextMenuItem>
        <ContextMenuItem onClick={handleNewTask}>
          <Plus className="size-4" />
          New Task
        </ContextMenuItem>
        <ContextMenuItem onClick={() => showManageModal({ repoGroupId })}>
          <Settings className="size-4" />
          Manage Workspace
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={handleDelete}>
          <Trash2 className="size-4" />
          Remove Workspace
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
