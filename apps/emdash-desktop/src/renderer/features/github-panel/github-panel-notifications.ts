import { reaction } from 'mobx';
import { toast } from '@renderer/lib/hooks/use-toast';
import { appState } from '@renderer/lib/stores/app-state';
import type { PanelIssue, PanelPr } from '@shared/github-panel';
import { githubPanelStore } from './stores/github-panel-store';

// ─── OS notification helper ─────────────────────────────────────────────────

function osNotify(title: string, body: string, onClick?: () => void) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'denied') return;

  const send = () => {
    const n = new Notification(title, { body, silent: false });
    if (onClick) n.onclick = () => onClick();
  };

  if (Notification.permission === 'granted') {
    send();
  } else {
    void Notification.requestPermission().then((perm) => {
      if (perm === 'granted') send();
    });
  }
}

function goToGithub() {
  appState.navigation.navigate('githubPanel');
}

// ─── State snapshots ────────────────────────────────────────────────────────

interface PrSnapshot {
  state: string;
  reviewState: string | null;
}

const prSnapshots = new Map<string, PrSnapshot>();
const reviewRequestUrls = new Set<string>();
const issueUrls = new Set<string>();

let initialized = false;

// ─── Diff helpers ───────────────────────────────────────────────────────────

function handleMyPrChanges(prev: Map<string, PrSnapshot>, curr: PanelPr[]) {
  for (const pr of curr) {
    const old = prev.get(pr.url);
    if (!old) continue; // new PR in list — not a notification we need for "my PRs"

    // PR merged
    if (old.state !== 'merged' && pr.state === 'merged') {
      const title = 'PR Merged';
      const body = `${pr.repoOwner}/${pr.repoName} #${pr.number}: ${pr.title}`;
      toast({ title, description: body, action: { label: 'View', onClick: goToGithub } });
      osNotify(title, body, goToGithub);
    }

    // PR closed (not merged)
    if (old.state === 'open' && pr.state === 'closed') {
      const title = 'PR Closed';
      const body = `${pr.repoOwner}/${pr.repoName} #${pr.number}: ${pr.title}`;
      toast({ title, description: body, action: { label: 'View', onClick: goToGithub } });
      osNotify(title, body, goToGithub);
    }

    // Approved
    if (old.reviewState !== 'approved' && pr.reviewState === 'approved') {
      const title = 'PR Approved';
      const body = `${pr.repoOwner}/${pr.repoName} #${pr.number}: ${pr.title}`;
      toast({ title, description: body, action: { label: 'View', onClick: goToGithub } });
      osNotify(title, body, goToGithub);
    }

    // Changes requested
    if (old.reviewState !== 'changes_requested' && pr.reviewState === 'changes_requested') {
      const title = 'Changes Requested';
      const body = `${pr.repoOwner}/${pr.repoName} #${pr.number}: ${pr.title}`;
      toast({
        title,
        description: body,
        variant: 'destructive',
        action: { label: 'View', onClick: goToGithub },
      });
      osNotify(title, body, goToGithub);
    }
  }
}

function handleNewReviewRequests(curr: PanelPr[]) {
  const incoming: PanelPr[] = [];
  for (const pr of curr) {
    if (!reviewRequestUrls.has(pr.url)) incoming.push(pr);
  }
  if (incoming.length === 0) return;

  if (incoming.length === 1) {
    const pr = incoming[0];
    const title = 'Review Requested';
    const body = `${pr.repoOwner}/${pr.repoName} #${pr.number}: ${pr.title}`;
    toast({ title, description: body, action: { label: 'Review', onClick: goToGithub } });
    osNotify(title, body, goToGithub);
  } else {
    const title = `${incoming.length} New Review Requests`;
    const body = incoming.map((p) => `#${p.number} ${p.title}`).join(', ');
    toast({ title, description: body, action: { label: 'Review', onClick: goToGithub } });
    osNotify(title, body, goToGithub);
  }
}

function handleNewIssues(curr: PanelIssue[]) {
  const incoming: PanelIssue[] = [];
  for (const issue of curr) {
    if (!issueUrls.has(issue.url)) incoming.push(issue);
  }
  if (incoming.length === 0) return;

  if (incoming.length === 1) {
    const issue = incoming[0];
    const title = 'Issue Assigned';
    const body = `${issue.repoOwner}/${issue.repoName} #${issue.number}: ${issue.title}`;
    toast({ title, description: body, action: { label: 'View', onClick: goToGithub } });
    osNotify(title, body, goToGithub);
  } else {
    const title = `${incoming.length} New Issues Assigned`;
    const body = incoming.map((i) => `#${i.number} ${i.title}`).join(', ');
    toast({ title, description: body, action: { label: 'View', onClick: goToGithub } });
    osNotify(title, body, goToGithub);
  }
}

// ─── Watcher setup ──────────────────────────────────────────────────────────

export function initGithubPanelNotifications(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // Seed the initial snapshots without firing notifications (skip first run)
  let myPrsFirstRun = true;
  let reviewFirstRun = true;
  let issuesFirstRun = true;

  const disposeMyPrs = reaction(
    () => githubPanelStore.myPrs.data,
    (curr) => {
      if (!curr) return;
      if (myPrsFirstRun) {
        // Seed snapshot silently
        for (const pr of curr) {
          prSnapshots.set(pr.url, { state: pr.state, reviewState: pr.reviewState });
        }
        myPrsFirstRun = false;
        return;
      }
      const prev = new Map(prSnapshots);
      handleMyPrChanges(prev, curr);
      // Update snapshot to current
      for (const pr of curr) {
        prSnapshots.set(pr.url, { state: pr.state, reviewState: pr.reviewState });
      }
      // Remove stale entries
      const currUrls = new Set(curr.map((p) => p.url));
      for (const url of prSnapshots.keys()) {
        if (!currUrls.has(url)) prSnapshots.delete(url);
      }
    }
  );

  const disposeReviews = reaction(
    () => githubPanelStore.reviewRequests.data,
    (curr) => {
      if (!curr) return;
      if (reviewFirstRun) {
        for (const pr of curr) reviewRequestUrls.add(pr.url);
        reviewFirstRun = false;
        return;
      }
      handleNewReviewRequests(curr);
      reviewRequestUrls.clear();
      for (const pr of curr) reviewRequestUrls.add(pr.url);
    }
  );

  const disposeIssues = reaction(
    () => githubPanelStore.assignedIssues.data,
    (curr) => {
      if (!curr) return;
      if (issuesFirstRun) {
        for (const issue of curr) issueUrls.add(issue.url);
        issuesFirstRun = false;
        return;
      }
      handleNewIssues(curr);
      issueUrls.clear();
      for (const issue of curr) issueUrls.add(issue.url);
    }
  );

  return () => {
    disposeMyPrs();
    disposeReviews();
    disposeIssues();
    initialized = false;
  };
}
