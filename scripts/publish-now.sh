#!/usr/bin/env bash
set -euo pipefail
npm whoami >/dev/null
npm run verify
npm publish --access public --provenance
