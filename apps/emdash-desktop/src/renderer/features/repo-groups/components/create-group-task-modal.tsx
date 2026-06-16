import { CheckSquare } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
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
import { Textarea } from '@renderer/lib/ui/textarea';

export type CreateGroupTaskModalArgs = { repoGroupId: string };
type Props = BaseModalProps<string> & CreateGroupTaskModalArgs;

export const CreateGroupTaskModal = observer(function CreateGroupTaskModal({
  repoGroupId,
  onSuccess,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = name.trim().length > 0;

  const handleCreate = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await rpc.repoGroups.createGroupTask({
      repoGroupId,
      name: name.trim(),
      initialPrompt: initialPrompt.trim() || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError('Failed to create task');
      return;
    }
    onSuccess(result.data.id);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <CheckSquare className="mr-2 inline h-4 w-4" />
          New Group Task
        </DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gt-name">Task Name</Label>
          <Input
            id="gt-name"
            placeholder="e.g. Migrate auth service"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gt-prompt">What should the agent work on?</Label>
          <Textarea
            id="gt-prompt"
            placeholder="Describe the task in detail..."
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-foreground-tertiary-muted">
            The agent will have access to all repos in this workspace simultaneously.
          </p>
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
