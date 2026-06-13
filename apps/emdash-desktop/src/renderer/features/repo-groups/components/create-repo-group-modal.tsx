import { Layers } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { getProjectManagerStore } from '@renderer/features/projects/stores/project-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
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

export type CreateRepoGroupModalArgs = Record<never, never>;

type Props = BaseModalProps<string> & CreateRepoGroupModalArgs;

export const CreateRepoGroupModal = observer(function CreateRepoGroupModal({
  onSuccess,
  onClose,
}: Props) {
  const { navigate } = useNavigate();
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreate = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await appState.repoGroups.createGroup({
        name: name.trim(),
        projectIds: [...selectedIds],
      });

      setSubmitting(false);

      if (!result.success) {
        const e = result.error;
        let msg: string;
        if (e.type === 'name-taken') msg = `Name "${name}" is already taken`;
        else if (e.type === 'min-members') msg = `Select at least ${e.required} repos`;
        else if (e.type === 'error') msg = e.message;
        else msg = 'Failed to create workspace';
        console.error('[create-repo-group] server error:', e);
        setError(msg);
        return;
      }

      onSuccess(result.data);
      navigate('repoGroup', { repoGroupId: result.data });
    } catch (err) {
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[create-repo-group] unexpected error:', err);
      setError(`Unexpected error: ${msg}`);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <Layers className="mr-2 inline h-4 w-4" />
          New Workspace
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name">Name</Label>
          <Input
            id="ws-name"
            placeholder="e.g. Payments Stack"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>
            Repos <span className="text-foreground-tertiary-muted">(select 2 or more)</span>
          </Label>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            {projects.length === 0 && (
              <p className="px-1 text-xs text-foreground-tertiary-muted">No projects found.</p>
            )}
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
          {selectedIds.size === 1 && (
            <p className="text-xs text-foreground-tertiary-muted">Select at least one more repo.</p>
          )}
        </div>

        {error && <p className="text-xs text-foreground-destructive">{error}</p>}
      </DialogContentArea>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!isValid || submitting}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </>
  );
});
