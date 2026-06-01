#!/usr/bin/env bash
set -euo pipefail

npm run lint
npm run test:coverage
npm run build
npm audit --audit-level=high
npm pack --dry-run
node dist/cli/index.js --version

echo "✓ DevForge is ready to release"
