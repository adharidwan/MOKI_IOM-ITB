#!/usr/bin/env bash
set -euo pipefail

input_path="${1:-}"
env_name="${2:-X_YT_DLP_COOKIES_CONTENT}"

if [[ -z "$input_path" ]]; then
  echo "Usage: $0 <cookies.txt> [ENV_NAME]" >&2
  exit 1
fi

if [[ ! -f "$input_path" ]]; then
  echo "Cookie file not found: $input_path" >&2
  exit 1
fi

python3 - "$input_path" "$env_name" <<'PY'
import sys

input_path = sys.argv[1]
env_name = sys.argv[2]

with open(input_path, 'r', encoding='utf-8') as file:
    content = file.read()

content = content.replace('\r\n', '\n').replace('\r', '\n')
escaped = (
    content
    .replace('\\', '\\\\')
    .replace('"', '\\"')
    .replace('\t', '\\t')
    .replace('\n', '\\n')
)

print(f'{env_name}="{escaped}"')
PY
