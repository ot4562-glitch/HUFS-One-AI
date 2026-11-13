#!/bin/sh
# #445: root-owned fixed wrapper installed at /usr/local/libexec/hufs-one-source-browser.
# No HTTP, credentials, host-root mount or configuration file is accepted here.
set -eu
if [ "$(/usr/bin/uname -s)" != Linux ] || [ "$(/usr/bin/id -u)" -eq 0 ]; then
  echo SOURCE_BROWSER_UNAVAILABLE >&2; exit 1
fi
for arg in "$@"; do
  # Chromium recognizes '-' and '--' prefixes and strips '=value' before
  # looking up switch keys. Test that key, never only one textual spelling.
  switch=${arg#--}
  if [ "$switch" = "$arg" ]; then switch=${arg#-}; fi
  switch=${switch%%=*}
  case "$switch" in
    *sandbox*|disable-web-security|allow-file-access-from-files|proxy-server|proxy-bypass-list|remote-debugging-port|load-extension|single-process|in-process-gpu)
      echo SOURCE_BROWSER_UNAVAILABLE >&2; exit 1 ;;
  esac
done
# Playwright passes only stdio and Chromium's remote-debugging-pipe FD 3/4.
# bubblewrap passes inherited descriptors to its executed child.
# A separate read-only rootfs contains Chromium, native libraries and fonts only.
exec /usr/bin/bwrap --die-with-parent --new-session --unshare-all --clearenv \
  --cap-drop ALL \
  --ro-bind /opt/hufs-one-source-browser/rootfs / \
  --proc /proc --dev /dev --tmpfs /tmp --chdir /tmp \
  --setenv PATH /usr/bin:/bin --setenv HOME /tmp --setenv LANG C --setenv LC_ALL C \
  /usr/lib/chromium/chromium "$@"
