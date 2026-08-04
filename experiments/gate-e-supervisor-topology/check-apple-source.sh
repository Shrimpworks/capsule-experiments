#!/bin/sh
# Development-only source evidence check for exact upstream revisions.
set -eu

if [ "$#" -ne 2 ]; then
    echo "usage: $0 /path/to/apple-container-1.0.0 /path/to/containerization-0.33.3" >&2
    exit 64
fi

container_source=$1
containerization_source=$2

expected_container_commit=ee848e3ebfd7c73b04dd419683be54fb450b8779
expected_containerization_commit=a2a1add6c7e1a1665e5397edc49d925c49090b3a

test "$(git -C "$container_source" rev-parse HEAD)" = "$expected_container_commit"
test "$(git -C "$containerization_source" rev-parse HEAD)" = "$expected_containerization_commit"

server=$container_source/Sources/ContainerXPC/XPCServer.swift
client=$container_source/Sources/Services/ContainerAPIService/Client/ContainerClient.swift
manager=$containerization_source/Sources/Containerization/ContainerManager.swift
entitlements=$containerization_source/signing/vz.entitlements

rg -q 'clientEuid == serverEuid' "$server"
if rg -q 'set_peer_(code_signing|team_identity|lightweight_code|requirement)' "$server"; then
    echo "unexpected peer code requirement found in Apple container API server" >&2
    exit 1
fi
rg -q 'private static let serviceIdentifier = "com.apple.container.apiserver"' "$client"
rg -q 'networking: Bool = true' "$manager"
rg -q 'if networking, let interface' "$manager"
rg -q '<key>com.apple.security.virtualization</key>' "$entitlements"

echo "PASS exact Apple sources retain the tested privilege and client-authentication shape"

