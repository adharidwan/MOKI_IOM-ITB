#!/bin/sh
set -eu

AUTH_ROOT="/app/.wwebjs_auth"

if [ -d "$AUTH_ROOT" ]; then
  find "$AUTH_ROOT" \
    \( -name 'SingletonLock' -o -name 'SingletonSocket' -o -name 'SingletonCookie' \) \
    -print \
    -delete
fi

exec node /app/scripts/whatsapp-bot.js
