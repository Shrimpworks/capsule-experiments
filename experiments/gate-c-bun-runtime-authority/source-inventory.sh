#!/bin/sh
set -eu

source_dir=${1:-}
expected_commit='0d9b296af33f2b851fcbf4df3e9ec89751734ba4'

if [ -z "$source_dir" ] || [ ! -d "$source_dir/.git" ]; then
  printf 'usage: %s /path/to/bun-v1.3.14-source\n' "$0" >&2
  exit 2
fi

actual_commit=$(git -C "$source_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
  printf 'unexpected Bun source commit: got %s, want %s\n' "$actual_commit" "$expected_commit" >&2
  exit 2
fi

printf 'commit=%s\n' "$actual_commit"
printf 'tag=%s\n' "$(git -C "$source_dir" describe --tags --exact-match)"

for file in \
  src/cli/Arguments.zig \
  src/codegen/internal-module-registry-scanner.ts \
  src/jsc/modules/_NativeModule.h \
  src/jsc/bindings/ExposeNodeModuleGlobals.cpp \
  src/jsc/bindings/BunObject.cpp \
  src/jsc/bindings/BunProcess.cpp \
  src/jsc/modules/BunJSCModule.h \
  src/js/node/child_process.ts \
  src/js/internal/cluster/primary.ts \
  src/js/bun/ffi.ts \
  src/jsc/bindings/sqlite/JSSQLStatement.cpp \
  src/jsc/web_worker.zig \
  src/runtime/api/bun/spawn.zig \
  src/jsc/bindings/bun-spawn.cpp \
  src/resolver/resolver.zig
do
  digest=$(shasum -a 256 "$source_dir/$file" | awk '{ print $1 }')
  printf '%s  %s\n' "$digest" "$file"
done

printf '\n== relevant CLI flags ==\n'
rg -n -- '--no-addons|--no-macros|--no-env-file|--no-install|--inspect' \
  "$source_dir/src/cli/Arguments.zig"

printf '\n== absent stock deny flags ==\n'
if rg -n -- '--no-spawn|--no-ffi' "$source_dir/src"; then
  printf 'unexpected stock deny flag found\n'
else
  printf 'no --no-spawn or --no-ffi match under src/\n'
fi

printf '\n== public/native capability registries ==\n'
rg -n 'BUN_FOREACH_ESM|bun:test|bun:jsc|BunObject' \
  "$source_dir/src/jsc/modules/_NativeModule.h"
rg -n '^[[:space:]]+(FFI|registerMacro|spawn|spawnSync)[[:space:]]' \
  "$source_dir/src/jsc/bindings/BunObject.cpp"
rg -n 'v\(ffi|v\(child_process|v\(inspector|v\(worker_threads|v\(jsc' \
  "$source_dir/src/jsc/bindings/ExposeNodeModuleGlobals.cpp"

printf '\n== subprocess and replacement-image paths ==\n'
rg -n 'Bun\.spawn|function spawn|function spawnSync|child_process\.fork' \
  "$source_dir/src/js/node/child_process.ts" \
  "$source_dir/src/js/internal/cluster/primary.ts"
rg -n 'Process_functionExecve|Process_functionDlopen|system\.posix_spawn\(|posix_spawn_bun\(|vfork\(|fork\(|execve\(' \
  "$source_dir/src/jsc/bindings/BunProcess.cpp" \
  "$source_dir/src/runtime/api/bun/spawn.zig" \
  "$source_dir/src/jsc/bindings/bun-spawn.cpp"

printf '\n== native loading and inspector paths ==\n'
rg -n 'nativeDLOpen|function dlopen|function cc|sqlite3_load_extension|startRemoteDebugger' \
  "$source_dir/src/js/bun/ffi.ts" \
  "$source_dir/src/jsc/bindings/sqlite/JSSQLStatement.cpp" \
  "$source_dir/src/jsc/modules/BunJSCModule.h"

printf '\n== worker propagation and discovery/install paths ==\n'
rg -n 'allow_addons|--no-addons' "$source_dir/src/jsc/web_worker.zig"
rg -n 'disable_default_env_files|global_cache = \.disable|global_cache = \.fallback' \
  "$source_dir/src/cli/Arguments.zig"
rg -n 'resolveAndAutoInstall' "$source_dir/src/resolver/resolver.zig"
