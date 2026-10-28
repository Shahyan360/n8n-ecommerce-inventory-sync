# Security policy

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/Shahyan360/n8n-ecommerce-inventory-sync/security/advisories/new). Include affected versions, impact and a minimal reproduction with synthetic data. Do not include customer records, tokens, database dumps or passwords in public issues.

The public Vercel application is a browser-only simulator and documentation site. It has no connection to the operational database, n8n editor, webhook gateway or merchant accounts. Its data resets with the page.

The Docker setup binds development ports to loopback. Do not expose the n8n editor, `/internal`, `/admin`, PostgreSQL or Redis directly to the internet. Before live use, follow [the production checklist](docs/PRODUCTION_CHECKLIST.md): TLS and network controls, credential rotation, least-privilege roles, external task runners, tested backups and verified inventory ownership.

`npm run setup` generates unique local credentials. `.env*` (except the example), `.runtime`, `.vercel`, backups, logs and runtime reports are excluded from Git. Credentials pasted into a chat or otherwise disclosed must be rotated before any public exposure. The local owner helper is for isolated mock instances only.

Supported security fixes target the latest repository revision. Run `npm audit --omit=dev` for the auxiliary services and separately inspect the pinned n8n/container dependency tree. A clean auxiliary audit does not establish that all upstream images are vulnerability-free.

Live merchant access, labels, charges and supplier purchase orders are never enabled by publishing this repository or its demo.
