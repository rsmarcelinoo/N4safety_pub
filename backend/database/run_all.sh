#!/usr/bin/env bash
# run_all.sh — applies every migration in order against the target database.
# Usage:
#   DB_URL=postgresql://user:pass@localhost:5432/n4safety ./run_all.sh
#
# Or with individual params:
#   PGUSER=postgres PGPASSWORD=secret PGDATABASE=n4safety PGHOST=localhost ./run_all.sh
#
# Requirements: psql must be on PATH (part of the postgresql-client package).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_URL="${DB_URL:-}"

run_sql() {
    local file="$1"
    echo "→ Applying: $(basename "$file")"
    if [[ -n "$DB_URL" ]]; then
        psql "$DB_URL" -f "$file" -v ON_ERROR_STOP=1 -q
    else
        psql -v ON_ERROR_STOP=1 -q -f "$file"
    fi
}

echo "=== N4Safety database migration ==="
echo ""

# Run in numbered order
for sql_file in "$SCRIPT_DIR"/0*.sql; do
    run_sql "$sql_file"
done

echo ""
echo "✓ All migrations applied successfully."
echo "  Danger zones seeded: Leiria City Centre, Zona Oeste, Parque da Cidade, Zona Industrial Norte"
