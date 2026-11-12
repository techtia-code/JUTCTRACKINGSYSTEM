# Repo setup

- `upstream` = group repo (techtia-code/JUTCTRACKINGSYSTEM). Source of truth; PRs go here.
- `origin` = personal fork (dontaeTracey/JUTCTRACKINGSYSTEM). The free-plan host deploys from this, so pushing to `origin/main` triggers a deploy.
- Local `main` tracks `upstream/main`.

# When the user says "deploy"

1. Run `git status`. If there are uncommitted changes, show them and ask whether to commit them before deploying. Never deploy silently with a dirty tree.
2. Run `git fetch upstream`, then `git merge upstream/main` into local `main`. If there are conflicts, stop and report them. Do not force-resolve.
3. Run `npm run build` (if a build script exists in package.json) and `npm test` (if present). If either fails, stop and report. Do not push.
4. Run `git push origin main`. Never force-push. Never push to `upstream` as part of a deploy.
5. Report the commit pushed, and that the host will auto-build from the fork. If the Vercel tools can see the project, check the deployment status and report it.

# Contributing to the group

Do not push directly to `upstream`. Push a feature branch to `origin`, then open a PR from the fork to `techtia-code/JUTCTRACKINGSYSTEM:main` (`gh pr create --repo techtia-code/JUTCTRACKINGSYSTEM`), only when asked.

# Keep out of group PRs

Deploy-only config (env vars, host-specific files) belongs in the host's dashboard, not in commits that go to the group.
