#!/bin/sh
set -e
# Optional push notifications: put firebase-service-account.json into ./secrets on the host.
# The app looks for it next to package.json; without it push is simply disabled.
if [ -f /secrets/firebase-service-account.json ]; then
  ln -sf /secrets/firebase-service-account.json /app/firebase-service-account.json
fi
exec "$@"
