#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"

printf 'dateUtc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'hostModel=%s\n' "$(system_profiler SPHardwareDataType | awk -F ': ' '/Model Identifier/ {print $2; exit}')"
printf 'architecture=%s\n' "$(uname -m)"
printf 'macOSVersion=%s\n' "$(sw_vers -productVersion)"
printf 'macOSBuild=%s\n' "$(sw_vers -buildVersion)"
printf 'hypervisorSupport=%s\n' "$(/usr/sbin/sysctl -n kern.hv_support)"
printf 'xcode=%s\n' "$(xcodebuild -version | tr '\n' ' ' | sed 's/ $//')"
printf 'clang=%s\n' "$(clang --version | sed -n '1p')"
printf 'go=%s\n' "$(go version)"
printf 'rust=%s\n' "$(rustc --version)"
printf 'libkrun=%s\n' '1.19.4'
printf 'libkrunfw=%s\n' '5.5.0'
if [ -f "$build_dir/runtime-manifest.txt" ]; then
    cat "$build_dir/runtime-manifest.txt"
fi
