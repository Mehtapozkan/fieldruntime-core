# Public Repository Checklist

Changing a private repository to public exposes its complete reachable Git history.
Treat visibility as a separate owner decision after the source change is merged.

## Before changing visibility

- Confirm GitHub PR #6 (Public Evaluation Preview Readiness) is merged with hosted
  CI and the Docker Compose smoke passing.
- Merge GitHub PR #12 (Public Launch Finalization) only after its hosted CI and
  Docker Compose smoke pass.
- Run `pnpm release:check` on the final `main` commit.
- Confirm `LICENSE`, `NOTICE`, `SECURITY.md`, `TRADEMARKS.md`, `OPEN_CORE.md`, and
  the release notes render correctly on GitHub.
- Confirm the full reachable history passes the high-confidence secret scan and
  contains no customer data, private prompts, credentials, or proprietary provider
  payloads.
- Enable GitHub private vulnerability reporting so `SECURITY.md` has a working
  confidential report path.
- Protect `main`: require the `ci` check, block force pushes and deletion, and
  require pull requests for changes.
- Set the repository description, `https://fieldruntime.ai` homepage, Apache-2.0
  license display, and relevant topics.
- Confirm the `publish evaluation preview` job completed after validation in the
  final green `main` CI run. It creates the immutable
  `v0.1.0-evaluation-preview.0` prerelease with the repository's scoped GitHub
  Actions token.

## Visibility change

The repository owner changes visibility in GitHub repository settings only after
the checklist above is complete. This codebase does not automate that action. Until
signed-out access works, describe the project as Apache-2.0-licensed source pending
publication—not as a publicly available open-source repository.

## Immediately after publication

- Open the repository in a signed-out browser and verify the README, screenshot,
  license, security policy, and links.
- Clone anonymously into a clean directory and run the five-minute evaluation.
- Confirm the application remains reachable only at `127.0.0.1` and reports
  external writes off.
- Confirm the automated `v0.1.0-evaluation-preview.0` tag and prerelease point to
  the exact green `main` commit and repeat the non-production boundary in their
  opening lines.

## Stop conditions

Do not publish if CI is red, the confidential vulnerability path is unavailable,
the anonymous clone differs from the reviewed tree, or any secret/customer-data
finding remains unresolved.
