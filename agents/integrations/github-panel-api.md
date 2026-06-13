# GitHub Panel — API Usage, Rate Limits & Design Decisions

This document covers the GitHub Panel feature's API call patterns, where rate limits
can be hit, the architectural decisions made to stay well within those limits, and
the trade-offs involved.

---

## GitHub REST API Rate Limits (reference)

| Account type | Limit |
|---|---|
| Authenticated (PAT / OAuth) | **5,000 req/hour** |
| GitHub Enterprise Server | Configured per instance (may be lower, often 5,000) |
| Search endpoint (`/search/issues`) | **30 req/min** sub-limit (separate from the 5,000/hr general limit) |
| Unauthenticated | 60 req/hour (never applies here — we always use a token) |

The GitHub Panel always makes authenticated calls via the stored PAT. The 5,000/hour
cap is shared with any other tool using the same token (GitHub CLI, other apps,
CI integrations, etc.).

---

## Call Budget: List Polling (background, all tabs)

The `GithubPanelStore` polls three endpoints on a **5-minute interval** while the
GitHub panel is mounted (which happens once on app launch and stays alive):

| Endpoint | Query | Calls/hr |
|---|---|---|
| `search.issuesAndPullRequests` | `is:pr is:open author:@me` | 12 |
| `search.issuesAndPullRequests` | `is:pr is:open review-requested:@me` | 12 |
| `search.issuesAndPullRequests` | `is:issue is:open assignee:@me` | 12 |
| **Total list polling** | | **36/hr** |

These hit the Search sub-limit (30 req/min), but 36 calls spread over 60 minutes
means one call every ~100 seconds — well within the 30/min burst limit.

The store also has `pauseWhenHidden: true`, so polling stops when Emdash is
backgrounded.

---

## Call Budget: PR Detail Polling (only when a PR is selected)

`PrDetailStore` is created when a PR is opened and destroyed when it is closed.
It polls on a **2-minute interval** with `pauseWhenHidden: true`:

| Endpoint | Purpose | Calls/hr (1 PR open, 1 hr) |
|---|---|---|
| `pulls.get` | PR state, head SHA, labels, etc. | 30 |
| `pulls.listReviews` | Review states | 30 |
| `issues.listComments` + `pulls.listReviewComments` | Comments | 60 |
| **Total detail polling** | | **120/hr** |

Combined with list polling: **~156 calls/hour** while actively viewing one PR.
That is 3.1% of the 5,000/hour budget.

---

## CI Status: The Problem with Bundling It Into the Detail Poll

An early implementation bundled `checks.listForRef` into every `getPrDetail` call.
This would have added:

- +1 `pulls.get` call (to get head SHA) — the detail fetch already has this, but
  `getPrCiStatus` fetches it separately when called standalone.
- +1 `checks.listForRef` call per poll cycle.

**Why that was a problem:**

1. **30 extra calls/hour per open PR** — 60 total for detail + CI. Multiplied across
   multiple open PRs (e.g. switching between PRs quickly) this compounds.
2. **CI status doesn't change every 2 minutes.** A typical GitHub Actions workflow
   takes 5–15 minutes. Polling it every 2 minutes gives ~6–8 calls per workflow run
   that return identical data.
3. **The Checks API has tighter rate limits on GitHub Enterprise** instances and can
   return 403 for repos where the token lacks `checks:read` scope — bundling CI into
   `getPrDetail` would cause the whole detail fetch to degrade.

---

## Current Design: Demand-Only CI Fetch

CI status is a **separate `Resource`** in `PrDetailStore` with strategy
`[{ kind: 'demand' }]`.

**What this means:**
- CI is fetched **exactly once** when you open a PR detail (triggered by a `useEffect`
  in `PrDetail` component, same pattern as file diffs).
- It is **never re-fetched on a timer** — only when you explicitly click "Refresh" or
  reopen the PR.
- `PrDetailStore` is disposed when you close the PR, so the Resource is torn down too.

**Call budget for CI:**

| Scenario | Calls |
|---|---|
| Open a PR → CI badge loads | 2 (pulls.get + checks.listForRef) |
| Switch to a different PR | 2 more |
| Stay on the same PR for 1 hour | 2 (only the initial open) |
| Click manual refresh | 2 more |

---

## Rate-Limit Scenarios Where You Could Hit the Cap

### Scenario 1: Many tools sharing the same token

If the same GitHub PAT is used by GitHub CLI (`gh`), CI systems, other IDE
extensions, or scripts running in parallel, all calls share the 5,000/hour bucket.
A busy CI pipeline can burn hundreds of calls/hour on its own.

**Workaround:** Use a dedicated PAT for Emdash (Settings → GitHub → Account) rather
than the same token used for `gh auth login` or CI.

### Scenario 2: Rapidly switching between many PRs

Each time you open a new PR detail, 2 CI calls are made immediately. Opening 50
different PRs in an hour = 100 calls just for CI, on top of the ~156 for detail polling.
This is still well within budget, but worth knowing.

### Scenario 3: GitHub Enterprise with restrictive limits

Some on-premise GHES installations set the rate limit lower (e.g. 1,000/hour) or
add per-endpoint quotas. The `checks.listForRef` endpoint may also be restricted to
tokens with `checks:read` scope.

**Workaround:** CI fetch fails gracefully — if `getPrCiStatus` returns an error, the
`ciStatus` Resource stores the error and the badge is simply hidden (`null`). No crash
or degraded PR detail view.

### Scenario 4: Search sub-limit burst

If you call `reload()` on the GitHub panel store many times in quick succession
(e.g. a fast manual refresh loop), the three search queries could hit the 30 req/min
search sub-limit.

GitHub returns HTTP 403 with `X-RateLimit-Remaining: 0` for search. The Resource
stores this as an error, shows a banner in the list pane, and retries on the next
5-minute poll cycle.

---

## API Call Summary Table

| Resource | Trigger | Interval | Calls per trigger |
|---|---|---|---|
| My PRs (list) | App mount + timer | 5 min | 1 |
| Review requests (list) | App mount + timer | 5 min | 1 |
| Assigned issues (list) | App mount + timer | 5 min | 1 |
| PR detail | PR selected + timer | 2 min | 2 (pulls.get + listReviews) |
| PR comments | PR selected + timer | 2 min | 2 (listComments + listReviewComments) |
| PR files (diff) | PR detail loaded | Demand only (once) | 1 |
| **CI status** | **PR detail loaded** | **Demand only (once)** | **2 (pulls.get + checks.listForRef)** |

---

## Pros / Cons of the Demand-Only CI Approach

### Pros
- **Zero timer calls for CI.** CI never adds to the 2-minute polling budget.
- **Failure-isolated.** A 403 on `checks:read` scope or a GHES limit error only
  affects the CI badge — the rest of the PR detail loads normally.
- **No stale-data notification issues.** The CI failure toast in `PrDetailStore`
  fires when `ciStatus` transitions to `failure`. With a timer, this could fire every
  2 minutes if the CI stays failed. With demand-only, it fires once per open.
- **Token scope optional.** Users without `checks:read` scope get `ciStatus: null`
  (badge hidden) rather than a broken PR view.

### Cons
- **CI badge doesn't auto-refresh.** If a workflow finishes (pending → success/failure)
  while you're viewing the PR, the badge won't update until you manually refresh or
  reopen the PR.
- **Two calls instead of one for CI.** The standalone `getPrCiStatus` has to fetch the
  PR first (to get head SHA) before calling `checks.listForRef`. If CI were bundled
  into `getPrDetail`, the head SHA would already be available. This costs one extra
  call per CI check. Acceptable since CI is demand-only.

### Why not poll CI on its own timer (e.g. every 5 min)?

That was considered. The issue: a CI run in progress triggers a "CI running" badge.
If the run finishes between two polls, the failure notification fires on the next
5-minute tick, which could be 4 minutes late. The demand-only model is honest: "this
was the status when you opened the PR." If you want fresh data, use the Refresh button.

A future option: add a `Poll on open` mode that polls CI every 60 seconds **only**
while a running status is detected, then stops once it settles. This would be
self-limiting and low overhead.

---

## Token Scope Requirements

| Feature | Required GitHub token scope |
|---|---|
| My PRs, Review requests, Issues | `repo` (read) |
| PR detail, files, comments | `repo` (read) |
| Submit review, add comment | `repo` (write) |
| CI status badge | `checks:read` (optional — badge is hidden if missing) |

---

## Future Improvements

- **`checks:read` scope detection**: surface a one-time prompt when `getPrCiStatus`
  returns a 403, explaining the missing scope.
- **Auto-refresh CI badge while running**: poll `ciStatus` every 60s if
  `ciStatus === 'running'`, stop when settled.
- **Webhook-driven updates**: instead of polling, subscribe to GitHub webhook events
  (`pull_request`, `check_run`, `check_suite`) for real-time badge + notification
  updates with zero polling overhead.
