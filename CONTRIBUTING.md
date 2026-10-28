# Contributing

Use Node.js 24 LTS and Docker Engine with Compose. Fork the repository, create a branch and run:

```sh
npm ci
npm run setup
npm run build
npm run verify:static
npm run build:web
docker compose --profile mock up -d --build
npm run test:db:prepare
npm test
npm run verify:runtime
```

Tests reset only `commerce_test`, use mock provider port 3302, and never use live merchant services. Keep fixtures synthetic. Run `npm run release:check` before committing. Do not commit `.env`, `.runtime`, `.vercel`, execution traces or backups.

Describe the behavior changed, its motivation and validation in your pull request. Inventory changes need meaningful concurrency/replay tests; provider changes need signature and failure cases. Keep all workflow IDs and sub-workflow references consistent. Regenerate exports with `npm run workflows:generate` only when their definitions change.

The public browser simulator is educational. Its tests do not replace PostgreSQL transaction or real n8n execution tests. Maintain its visible simulation labels and keep it independent from live credentials and operational APIs.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
