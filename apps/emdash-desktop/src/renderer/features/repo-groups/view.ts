import type { GuardResult } from '@renderer/app/view-registry';
import { appState } from '@renderer/lib/stores/app-state';
import { RepoGroupMainPanel } from './components/repo-group-main-panel';
import { RepoGroupViewWrapper } from './components/repo-group-view-wrapper';

export const repoGroupView = {
  WrapView: RepoGroupViewWrapper,
  MainPanel: RepoGroupMainPanel,
  canActivate: (params: unknown): GuardResult => {
    const repoGroupId =
      typeof params === 'object' && params !== null
        ? (params as { repoGroupId?: unknown }).repoGroupId
        : undefined;
    if (typeof repoGroupId !== 'string') return { ok: false, redirect: 'home' };
    return appState.repoGroups.groups.has(repoGroupId)
      ? { ok: true }
      : { ok: false, redirect: 'home' };
  },
};
