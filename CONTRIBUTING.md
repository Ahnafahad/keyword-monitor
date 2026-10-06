# Contributing

Thanks for helping improve Keyword Monitor. Bug reports, documentation fixes, and focused pull requests are welcome.

## Before you start

- Search existing issues and pull requests. For a large change, open an issue to discuss the intended behavior first.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security concerns through the process in [SECURITY.md](SECURITY.md), rather than a public issue.
- Never commit `.env`, API tokens, `data/`, raw provider output, or screenshots that expose personal data.

## Local setup

Follow the [README setup instructions](README.md#get-started). Development needs Node.js 24 or newer. Copy `.env.example` to `.env` and use your own Apify token for live searches. The automated test suite does not need a token or paid runs.

## Making a change

1. Create a branch and make a focused change that follows the existing code style.
2. Update user facing documentation when behavior or configuration changes.
3. Run `npm run typecheck`, `npm run build`, and `npm test` before opening a pull request.
4. Describe what changed and how you checked it in the pull request template.

Live provider runs spend Apify credit. Avoid using a live run for routine code checks. If a provider change needs one, state what you ran and the result in the pull request.
