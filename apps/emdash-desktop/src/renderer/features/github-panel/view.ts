import type { ViewDefinition } from '@renderer/app/view-registry';
import { GithubPanelMainPanel } from './main-panel';
import { GithubPanelTitlebar } from './titlebar';

export const githubPanelView: ViewDefinition = {
  MainPanel: GithubPanelMainPanel,
  TitlebarSlot: GithubPanelTitlebar,
};
