#!/bin/sh
set -eu

source_root=${1:?usage: audit-pids-patch.sh PATH_TO_PATCHED_CONTAINERIZATION_0_33_3}
expected_commit=a2a1add6c7e1a1665e5397edc49d925c49090b3a
actual_commit=$(git -C "$source_root" rev-parse HEAD)

test "$actual_commit" = "$expected_commit"
rg -q 'public var pidsLimit: Int64\?' \
  "$source_root/Sources/Containerization/LinuxContainer.swift"
rg -q 'pids: config\.pidsLimit\.map \{ LinuxPids\(limit: \$0\) \}' \
  "$source_root/Sources/Containerization/LinuxContainer.swift"
rg -q 'if let pids = resources.pids' \
  "$source_root/vminitd/Sources/Cgroup/Cgroup2Manager.swift"

echo "sourceCommit=$actual_commit"
echo 'capsulePatchPidsSurface=true'
echo 'guestPidsMechanism=true'
