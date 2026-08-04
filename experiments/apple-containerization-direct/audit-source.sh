#!/bin/sh
set -eu

source_root=${1:?usage: audit-source.sh PATH_TO_CONTAINERIZATION_0_33_3}
expected_commit=a2a1add6c7e1a1665e5397edc49d925c49090b3a
actual_commit=$(git -C "$source_root" rev-parse HEAD)

test "$actual_commit" = "$expected_commit"
rg -q 'networking: Bool = true' "$source_root/Sources/Containerization/ContainerManager.swift"
rg -q 'public var noNewPrivileges: Bool = false' \
  "$source_root/Sources/Containerization/LinuxProcessConfiguration.swift"
rg -q 'if let pids = resources.pids' "$source_root/vminitd/Sources/Cgroup/Cgroup2Manager.swift"
rg -q 'public var pids: LinuxPids?' "$source_root/Sources/ContainerizationOCI/Spec.swift"

if rg -q 'public var pids' "$source_root/Sources/Containerization/LinuxContainer.swift"; then
  echo 'unexpected: LinuxContainer.Configuration now exposes pids; rerun the decision spike'
  exit 1
fi

echo "sourceCommit=$actual_commit"
echo 'networkingFalseSurface=true'
echo 'noNewPrivilegesSurface=true'
echo 'guestPidsMechanism=true'
echo 'linuxContainerPidsSurface=false'
