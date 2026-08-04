#!/bin/sh
set -eu

# DEVELOPMENT-ONLY, read-only Gate C P0-0 construction-surface inventory.
# It does not patch or build Bun and is not an isolation boundary.

source_dir=${1:-/private/tmp/capsule-gate-c-p0-0-bun-src-network}
expected_commit=0d9b296af33f2b851fcbf4df3e9ec89751734ba4
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
experiment_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail 'git is required'
command -v shasum >/dev/null 2>&1 || fail 'shasum is required'
command -v rg >/dev/null 2>&1 || fail 'ripgrep is required'
[ -d "$source_dir/.git" ] || fail "source checkout is absent: $source_dir"
[ "$(git -C "$source_dir" rev-parse HEAD)" = "$expected_commit" ] || fail 'wrong source commit'
[ "$(git -C "$source_dir" describe --tags --exact-match)" = bun-v1.3.14 ] || fail 'wrong source tag'
[ -z "$(git -C "$source_dir" status --porcelain)" ] || fail 'source checkout is dirty'

hand_authored_files='scripts/build/profiles.ts
scripts/build/config.ts
scripts/build/flags.ts
build.zig
scripts/build/zig.ts
src/bun_core/env.zig
src/codegen/internal-module-registry-scanner.ts
src/codegen/bundle-modules.ts
scripts/build/codegen.ts
src/jsc/modules/_NativeModule.h
src/jsc/bindings/InternalModuleRegistry.h
src/jsc/bindings/InternalModuleRegistry.cpp
src/resolve_builtins/HardcodedModule.zig
src/jsc/bindings/isBuiltinModule.cpp
src/jsc/modules/NodeModuleModule.cpp
src/jsc/bindings/ProcessBindingNatives.cpp
src/jsc/bindings/ModuleLoader.cpp
src/jsc/ModuleLoader.zig
src/jsc/bindings/ExposeNodeModuleGlobals.cpp
src/jsc/bindings/BunObject.cpp
src/runtime/api/BunObject.zig
src/jsc/bindings/BunObject+exports.h
src/jsc/bindings/BunProcess.cpp
src/runtime/api/bun/spawn.zig
src/jsc/bindings/bun-spawn.cpp
src/jsc/bindings/ZigGlobalObject.lut.txt
src/jsc/bindings/webcore/JSWorker.cpp
src/jsc/bindings/webcore/Worker.cpp
src/js/builtins/CommonJS.ts
src/bundler/options.zig
src/jsc/bindings/JSBundlerPlugin.cpp
src/jsc/bindings/sqlite/JSSQLStatement.cpp
scripts/build/deps/sqlite.ts
src/jsc/modules/BunJSCModule.h
src/cli/Arguments.zig
src/cli/bunfig.zig
src/cli/run_command.zig
src/jsc/VirtualMachine.zig
src/resolver/resolver.zig
src/bun_core/feature_flags.zig'

generated_outputs='InternalModuleRegistry+numberOfModules.h
InternalModuleRegistry+enum.h
InternalModuleRegistry+createInternalModuleById.h
InternalModuleRegistryConstants.h
ResolvedSourceTag.zig
SyntheticModuleType.h
NativeModuleImpl.h
BunObject.lut.h
ZigGlobalObject.lut.h
BunProcess.lut.h'

conditional_generated_outputs='ProcessBindingNatives.lut.h
NodeModuleModule.lut.h'

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/capsule-p0-0-review.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
manifest=$tmp_dir/hand-authored.sha256
fixture_manifest=$tmp_dir/fixtures.sha256
: >"$manifest"
: >"$fixture_manifest"

hand_count=0
for relative_path in $hand_authored_files; do
  [ -f "$source_dir/$relative_path" ] || fail "missing hand-authored source: $relative_path"
  digest=$(shasum -a 256 "$source_dir/$relative_path" | awk '{print $1}')
  printf '%s  %s\n' "$digest" "$relative_path" >>"$manifest"
  hand_count=$((hand_count + 1))
done

[ "$hand_count" -eq 40 ] || fail "unexpected hand-authored count: $hand_count"

fixture_count=0
for fixture_path in "$script_dir/container/baseline.ts" $(find "$experiment_dir/probes" -type f | LC_ALL=C sort); do
  relative_path=${fixture_path#"$experiment_dir/"}
  digest=$(shasum -a 256 "$fixture_path" | awk '{print $1}')
  printf '%s  %s\n' "$digest" "$relative_path" >>"$fixture_manifest"
  fixture_count=$((fixture_count + 1))
done

printf 'decision=NO-GO\n'
printf 'reason=construction-surface-not-small-or-reviewable\n'
printf 'source.commit=%s\n' "$expected_commit"
printf 'source.tag=bun-v1.3.14\n'
printf 'source.clean=1\n'
printf 'source.trackedFiles=%s\n' "$(git -C "$source_dir" ls-files | wc -l | tr -d ' ')"
printf 'surface.handAuthored.count=%s\n' "$hand_count"
printf 'surface.handAuthored.manifestSha256=%s\n' "$(shasum -a 256 "$manifest" | awk '{print $1}')"
printf 'surface.generated.minimum.count=10\n'
printf 'surface.generated.conditional.count=2\n'
printf 'fixtures.count=%s\n' "$fixture_count"
printf 'fixtures.manifestSha256=%s\n' "$(shasum -a 256 "$fixture_manifest" | awk '{print $1}')"
printf 'prerequisite.builder.id=sha256:47b2d086f6f131b2ed4a30e43dc409bd87c5dd4cc15900bc8888819e237c86e5\n'
printf 'prerequisite.stockBinary.sha256=c06708363d3903ee3e2fd11622ca14175784acaf4006b5d372bbb5588b31d52b\n'
printf 'candidate.patch.present=0\n'
printf 'candidate.patch.emptySha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n'
printf 'candidate.binary.present=0\n'
printf 'candidate.build.started=0\n'

printf '\n[hand-authored-source-sha256]\n'
cat "$manifest"

printf '\n[fixture-sha256]\n'
cat "$fixture_manifest"

printf '\n[generated-output-minimum]\n'
printf '%s\n' "$generated_outputs"

printf '\n[generated-output-conditional]\n'
printf '%s\n' "$conditional_generated_outputs"

printf '\n[route-hit-counts]\n'
for pattern in \
  'spawn|spawnSync|execve|child_process|cluster' \
  'dlopen|bun:ffi|NAPI|\.node|loadExtension|sqlite3_load_extension|plugin' \
  'inspector|startRemoteDebugger|BUN_INSPECT' \
  'Worker|worker_threads|web_worker' \
  'registerMacro|macro|preload|bunfig|env-file|disable_default_env_files' \
  'resolveAndAutoInstall|node_modules|global_cache|no_install'; do
  count=$(printf '%s\n' "$hand_authored_files" | sed "s#^#$source_dir/#" | xargs rg -n -i "$pattern" | wc -l | tr -d ' ')
  printf '%s=%s\n' "$pattern" "$count"
done
