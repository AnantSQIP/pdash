#!/usr/bin/env bash
# Print the current public demo URL and whether it's live.
ROOT="/home/sqip031/pdash"
url=$(cat "$ROOT/.tunnel-url" 2>/dev/null)
# fall back to whatever the running cloudflared actually logged
if [ -z "$url" ] || ! curl -sf -o /dev/null --max-time 8 "$url/login"; then
  url=$(grep -hoE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel.log "$ROOT/.cf-tunnel.log" 2>/dev/null | tail -1)
  [ -n "$url" ] && echo "$url" > "$ROOT/.tunnel-url"
fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url/login" 2>/dev/null)
echo "Public demo URL : $url"
echo "Status          : HTTP $code $([ "$code" = 200 ] && echo '(LIVE)' || echo '(NOT reachable)')"
