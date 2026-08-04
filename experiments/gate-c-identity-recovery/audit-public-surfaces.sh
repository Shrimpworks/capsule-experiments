#!/bin/sh
set -eu

source_root=${1:?usage: audit-public-surfaces.sh PATH_TO_CONTAINERIZATION_0_33_3}
expected_commit=a2a1add6c7e1a1665e5397edc49d925c49090b3a
actual_commit=$(git -C "$source_root" rev-parse HEAD)
sdk_root=$(xcrun --sdk macosx --show-sdk-path)
vz_headers="$sdk_root/System/Library/Frameworks/Virtualization.framework/Versions/A/Headers"

test "$actual_commit" = "$expected_commit"
test -z "$(git -C "$source_root" status --short)"

manager="$source_root/Sources/Containerization/VirtualMachineManager.swift"
instance="$source_root/Sources/Containerization/VirtualMachineInstance.swift"
container_manager="$source_root/Sources/Containerization/ContainerManager.swift"
vz_instance="$source_root/Sources/Containerization/VZVirtualMachineInstance.swift"
vminitd="$source_root/Sources/Containerization/Vminitd.swift"

rg -q 'func create\(config: some VMCreationConfig\)' "$manager"
if rg -q 'func (list|open|enumerate|reconnect|restore|lookup)\(' \
  "$manager" "$instance" "$container_manager"; then
  echo 'unexpected public Containerization recovery/enumeration surface; rerun the decision spike'
  exit 1
fi
if rg -q 'var (id|identifier|pid|processIdentifier)' "$instance"; then
  echo 'unexpected public VirtualMachineInstance identity surface; rerun the decision spike'
  exit 1
fi

rg -q 'config\.socketDevices = \[VZVirtioSocketDeviceConfiguration\(\)\]' "$vz_instance"
rg -q 'public static let port: UInt32 = 1024' "$vminitd"
rg -q 'The generic machine identifier is used by guests to uniquely identify the virtual hardware' \
  "$vz_headers/VZGenericMachineIdentifier.h"
rg -q '@interface VZVirtualMachine : NSObject' "$vz_headers/VZVirtualMachine.h"
if rg -q '(enumerate|reconnect|runningVirtualMachines|processIdentifier|helperIdentifier)' \
  "$vz_headers/VZVirtualMachine.h"; then
  echo 'unexpected Virtualization runtime enumeration/helper surface; rerun the decision spike'
  exit 1
fi

printf 'containerizationCommit=%s\n' "$actual_commit"
printf 'containerizationRuntimeEnumeration=false\n'
printf 'containerizationDurableVMIdentity=false\n'
printf 'virtualizationHelperEnumeration=false\n'
printf 'genericMachineIdentifierSemantic=guest-virtual-hardware-identity\n'
printf 'managementVsockDeviceConfigured=true\n'
printf 'managementVsockPort=1024\n'
