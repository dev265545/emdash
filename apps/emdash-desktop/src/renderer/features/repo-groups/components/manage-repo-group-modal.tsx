import { Layers } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { Input } from '@renderer/lib/ui/input';
import { Label } from '@renderer/lib/ui/label';
import { getRepoGroupStore } from '../stores/repo-group-selectors';

export type ManageRepoGroupModalArgs = { repoGroupId: string };

type Props = BaseModalProps<void> & ManageRepoGroupModalArgs;

export const ManageRepoGroupModal = observer(function ManageRepoGroupModal({
  repoGroupId,
  onSuccess,
  onClose,
}: Props) {
  const { navigate } = useNavigate();
  const showConfirm = useShowModal('confirmActionModal');
  const group = getRepoGroupStore(repoGroupId);

  const [name, setName] = useState(group?.data.name ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(group?.data.memberProjectIds ?? [])
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.data.name);
      setSelectedIds(new Set(group.data.memberProjectIds));
    }
  }, [group?.data.name]);

  const projectManager = getProjectManagerStore();
  const projects = Array.from(projectManager.projects.values()).filter(
    (p) => p.state !== 'unregistered'
  );

  const isValid = name.trim().length > 0 && selectedIds.size >= 2;

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await appState.repoGroups.updateGroup(repoGroupId, {
      name: name.trim(),
      projectIds: [...selectedIds],
    });

    setSubmitting(false);

    if (!result.success) {
      const e = result.error;
      setError(e.type === 'name-taken' ? `Name "${name}" is already taken` : 'Failed to save');
      return;
    }

    onSuccess();
  };

  const handleDelete = () => {
    showConfirm({
      title: 'Remove Workspace',
      description: `Remove "${group?.data.name ?? 'this workspace'}"? Member projects and their tasks are unaffected.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onSuccess: async () => {
        await appState.repoGroups.deleteGroup(repoGroupId);
        onClose();
        navigate('home');
      },
    });
  };

  if (!group) return null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <Layers className="mr-2 inline h-4 w-4" />
          Workspace Settings
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name-edit">Name</Label>
          <Input
            id="ws-name-edit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Repos</Label>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            {projects.map((p) => (
              <label
                key={p.id}
                className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5"
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => toggleProject(p.id)}
                />
                <span className="truncate text-sm">{p.name}</span>
              </label>
            ))}
          </div>
          {selectedIds.size < 2 && (
            <p className="text-xs text-foreground-tertiary-muted">
              Workspace needs at least 2 repos.
            </p>
          )}
        </div>

        {error && <p className="text-xs text-foreground-destructive">{error}</p>}
      </DialogContentArea>
      <DialogFooter className="justify-between">
        <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
          Delete Workspace
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
});
