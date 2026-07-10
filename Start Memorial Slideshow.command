#!/bin/zsh
set -e
cd "$(dirname "$0")"

URL="http://localhost:3000"
if ! curl --silent --fail "$URL" >/dev/null 2>&1; then
  npm run dev > .slideshow.log 2>&1 &
  for attempt in {1..30}; do
    curl --silent --fail "$URL" >/dev/null 2>&1 && break
    sleep 1
  done
fi

open "$URL"
