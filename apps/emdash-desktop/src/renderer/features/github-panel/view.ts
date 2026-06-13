import type { ViewDefinition } from '@renderer/app/view-registry';
import { GithubPanelMainPanel } from './main-panel';

export const githubPanelView: ViewDefinition = {
  MainPanel: GithubPanelMainPanel,
};
