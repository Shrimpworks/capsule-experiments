#!/bin/sh
set -eu

# DEVELOPMENT-ONLY Gate C P0-0 evidence collector. Product packages must not import it.
source_dir=${1:-/private/tmp/capsule-gate-c-p0-0-bun-src-network}
expected_commit='0d9b296af33f2b851fcbf4df3e9ec89751734ba4'

if [ ! -d "$source_dir/.git" ]; then
  printf 'source.present=no\n'
  printf 'source.path=%s\n' "$source_dir"
  exit 2
fi

actual_commit=$(git -C "$source_dir" rev-parse HEAD)
printf 'source.present=yes\n'
printf 'source.path=%s\n' "$source_dir"
printf 'source.commit=%s\n' "$actual_commit"
printf 'source.tag=%s\n' "$(git -C "$source_dir" describe --tags --exact-match)"
printf 'source.worktreeChanges=%s\n' "$(git -C "$source_dir" status --porcelain | wc -l | tr -d ' ')"

if [ "$actual_commit" != "$expected_commit" ]; then
  printf 'source.commitMatches=no\n'
  exit 2
fi
printf 'source.commitMatches=yes\n'

for tool in bun cmake ninja clang-21 go rustc cargo ruby automake ccache gsed glibtool pkg-config
do
  if tool_path=$(command -v "$tool" 2>/dev/null); then
    printf 'tool.%s=%s\n' "$tool" "$tool_path"
  else
    printf 'tool.%s=missing\n' "$tool"
  fi
done

for relative_path in build node_modules vendor/zig
do
  if [ -e "$source_dir/$relative_path" ]; then
    printf 'buildInput.%s=present\n' "$relative_path"
  else
    printf 'buildInput.%s=missing\n' "$relative_path"
  fi
done

printf 'host.uname=%s\n' "$(uname -a)"
printf 'host.productVersion=%s\n' "$(sw_vers -productVersion)"
printf 'host.buildVersion=%s\n' "$(sw_vers -buildVersion)"
