import { createContext, useContext } from 'react';
import type { TabManagerStore } from '@renderer/features/tasks/tabs/tab-manager-store';

/**
 * Optional override for where a ChangesPanel opens its diff tabs. Normally a
 * ChangesPanel opens diffs in its own task's tab manager. When this context
 * provides a manager, the panel opens diffs there instead and stamps each diff
 * with its own task as the source (so the diff still renders under that repo's
 * git context). Used by the repo-group panel to surface a member repo's diffs
 * as tabs in the shared agent's tab strip. Null = default (own tab manager).
 */
export const DiffTabTargetContext = createContext<TabManagerStore | null>(null);

export function useDiffTabTarget(): TabManagerStore | null {
  return useContext(DiffTabTargetContext);
}
