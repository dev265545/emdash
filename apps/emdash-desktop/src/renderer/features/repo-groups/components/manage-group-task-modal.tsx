import { CheckSquare, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import type { GroupTaskStatus } from '@shared/core/repo-groups/group-tasks';
import { getRepoGroupStore } from '../stores/repo-group-selectors';

export type ManageGroupTaskModalArgs = { groupTaskId: string; repoGroupId: string };
type Props = BaseModalProps<void> & ManageGroupTaskModalArgs;

const STATUSES: GroupTaskStatus[] = [
  'todo',
  'in_progress',
  'review',
  'done',
  'backlog',
  'cancelled',
  'triage',
];
const STATUS_LABEL: Record<GroupTaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
  backlog: 'Backlog',
  triage: 'Triage',
  duplicate: 'Duplicate',
};

export const ManageGroupTaskModal = observer(function ManageGroupTaskModal({
  groupTaskId,
  repoGroupId,
  onSuccess,
  onClose,
}: Props) {
  const showConfirm = useShowModal('confirmActionModal');
  const group = getRepoGroupStore(repoGroupId);
  const task = group?.groupTasks.get(groupTaskId);

  const [name, setName] = useState(task?.data.name ?? '');
  const [status, setStatus] = useState<GroupTaskStatus>(task?.data.status ?? 'todo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setName(task.data.name);
      setStatus(task.data.status);
    }
  }, [task?.data.name, task?.data.status]);

  if (!task) return null;

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await rpc.repoGroups.updateGroupTask(groupTaskId, { name: name.trim(), status });
    setSubmitting(false);
    if (!result.success) {
      setError('Failed to save');
      return;
    }
    onSuccess();
  };

  const handleArchive = () => {
    showConfirm({
      title: 'Archive Task',
      description: `Archive "${task.data.name}"?`,
      confirmLabel: 'Archive',
      onSuccess: async () => {
        await rpc.repoGroups.archiveGroupTask(groupTaskId);
        onClose();
      },
    });
  };

  const handleDelete = () => {
    showConfirm({
      title: 'Delete Task',
      description: `Delete "${task.data.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onSuccess: async () => {
        await rpc.repoGroups.deleteGroupTask(groupTaskId);
        onClose();
      },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <CheckSquare className="mr-2 inline h-4 w-4" />
          Edit Task
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gt-edit-name">Name</Label>
          <Input
            id="gt-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as GroupTaskStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-xs text-foreground-destructive">{error}</p>}
      </DialogContentArea>
      <DialogFooter className="justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleArchive} disabled={submitting}>
            Archive
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
});
