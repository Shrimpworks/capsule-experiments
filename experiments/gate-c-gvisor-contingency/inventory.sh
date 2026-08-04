#!/bin/bash
set -euo pipefail

printf 'host:\n'
uname -a
sw_vers

printf '\nclient inventory:\n'
for tool in docker podman nerdctl runsc ctr containerd containerd-shim-runsc-v1 runc crun finch \
  lima limactl colima orbctl; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%-28s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '%-28s absent\n' "$tool"
  fi
done

if command -v docker >/dev/null 2>&1; then
  printf '\ndocker client:\n'
  docker version --format 'client={{.Client.Version}} server={{if .Server}}{{.Server.Version}}{{else}}unavailable{{end}}'
  printf 'context=%s\n' "$(docker context show)"
  printf 'server runtimes=%s\n' \
    "$(docker info --format '{{range $name, $_ := .Runtimes}}{{$name}} {{end}}')"
  printf 'default runtime=%s\n' "$(docker info --format '{{.DefaultRuntime}}')"
  printf 'cgroup=%s/%s\n' \
    "$(docker info --format '{{.CgroupDriver}}')" \
    "$(docker info --format '{{.CgroupVersion}}')"
fi

if command -v podman >/dev/null 2>&1; then
  printf '\npodman client:\n'
  podman --version
  podman machine list --format json || true
fi
