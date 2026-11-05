#!/bin/sh
# Starts alice-companion in its container.
#
# NOTICE:
# The companion lock file holds only a PID. After a crash or a power loss, the new container
# often starts the service with the same PID, so the service sees its own old lock as alive and stops.
# Source: services/alice-companion/src/state-store.ts (createLockFile, isProcessAlive).
# Compose runs one companion per data volume, so a lock at container start is always stale.
# Removal condition: the lock records a value that a new container cannot repeat, for example a boot ID.
set -eu

data_dir="${ALICE_COMPANION_DATA_DIR:-/data}"
if [ -f "$data_dir/companion.lock" ]; then
  echo "companion-entrypoint: removing the lock of the previous container ($(cat "$data_dir/companion.lock"))"
  rm -f "$data_dir/companion.lock"
fi

exec "$@"
