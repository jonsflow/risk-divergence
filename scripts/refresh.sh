#!/usr/bin/env bash
# Fetch all data and regenerate all caches, using the same pipeline as CI.
# Usage: ./scripts/refresh.sh  (run from repo root)

set -e

# Load FRED_API_KEY from .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "==> [1/3] Seeding SQLite from CSVs..."
python3 -m pipeline.run seed

echo "==> [2/3] Fetching Yahoo + FRED..."
python3 -m pipeline.run fetch

echo "==> [3/3] Generating caches..."
python3 -m pipeline.run generate

echo ""
echo "Done. All data fetched and caches regenerated."
