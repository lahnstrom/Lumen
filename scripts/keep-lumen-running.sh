#!/usr/bin/env bash
set -euo pipefail
# This foreground process holds WSL open; systemd alone does not keep WSL alive.
systemctl --user start lumen.service
exec tail -f /dev/null
