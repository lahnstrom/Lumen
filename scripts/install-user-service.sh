#!/usr/bin/env bash
set -euo pipefail
lumen_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
lumen_node="$(command -v node)"
mkdir -p "$HOME/.config/systemd/user"
python3 - "$lumen_root" "$lumen_node" <<'PY'
from pathlib import Path
import sys
root, node = sys.argv[1:]
# systemd paths use quoted C-style strings; escape specifiers as well.
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
path = str(Path(node).parent) + ':' + str(Path.home() / '.local/bin') + ':/usr/local/bin:/usr/bin:/bin'
unit = '\n'.join(['[Unit]', 'Description=Lumen learning workspace', 'After=network.target', '', '[Service]', 'Type=simple', 'WorkingDirectory=' + root.replace('%', '%%'), 'ExecStart=' + quote(node) + ' server/index.js', 'Environment=' + quote('PATH=' + path), 'Restart=on-failure', 'RestartSec=5', 'TimeoutStopSec=20', 'UMask=0077', '', '[Install]', 'WantedBy=default.target', ''])
(Path.home() / '.config/systemd/user/lumen.service').write_text(unit)
PY
systemctl --user daemon-reload
systemctl --user enable lumen.service
printf '%s\n' 'Installed. Run systemctl --user start lumen after stopping any manually started server on port 4317.'
