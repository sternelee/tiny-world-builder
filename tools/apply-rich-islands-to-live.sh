#!/bin/bash
set -e

echo "=== Apply rich Tinyverse islands + hub + stargates to LIVE Netlify DB ==="
echo ""
echo "1. Go to Netlify dashboard → tiny-world-builder site → Databases"
echo "2. Copy the Production connection string (it starts with postgres://...)"
echo ""
read -p "Paste the live Netlify DB connection string here: " LIVE_DB_URL

if [ -z "$LIVE_DB_URL" ]; then
  echo "No URL provided. Exiting."
  exit 1
fi

echo ""
echo "Applying migration to LIVE..."
psql "$LIVE_DB_URL" -f netlify/database/migrations/20260620143000_rich_tinyverse_islands.sql

echo ""
echo "Done. The rich islands + Tinyverse Nexus (hub) with stargates should now be in the live DB."
echo "You can now test from https://mmo-preview--tiny-world-builder.netlify.app"
