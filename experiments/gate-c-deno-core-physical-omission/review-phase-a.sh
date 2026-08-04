#!/bin/sh
set -eu

# Development-only, read-only Phase A inventory. This does not patch or build deno_core.

if [ "$#" -ne 2 ]; then
  echo "usage: $0 DENO_CORE_0_409_0_CRATE DENO_V2_9_4_SOURCE_ROOT" >&2
  exit 2
fi

crate_archive=$1
deno_source=$2
expected_crate=16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4
expected_source_commit=14eea3160ae5834476aa3b9d317b8d41d991b982
core="$deno_source/libs/core"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

[ -f "$crate_archive" ] || fail "missing crate archive: $crate_archive"
[ -f "$core/ops_builtin.rs" ] || fail "missing Deno libs/core source: $core"

actual_crate=$(shasum -a 256 "$crate_archive" | awk '{print $1}')
[ "$actual_crate" = "$expected_crate" ] || fail "wrong deno_core crate digest"

if [ -d "$deno_source/.git" ]; then
  actual_commit=$(git -C "$deno_source" rev-parse HEAD)
  [ "$actual_commit" = "$expected_source_commit" ] || fail "wrong Deno source commit"
else
  actual_commit=archive-verified-separately
fi

for relative in \
  ops_builtin.rs \
  ops_builtin_types.rs \
  ops_builtin_v8.rs \
  extension_set.rs \
  runtime/jsruntime.rs \
  runtime/bindings.rs \
  runtime/snapshot.rs \
  00_primordials.js \
  00_infra.js \
  01_core.js \
  02_timers.js
do
  [ -f "$core/$relative" ] || fail "missing source: $relative"
done

op_list=$(awk '
  /^builtin_ops! \{/ { inside=1; next }
  inside && /^}/ { inside=0 }
  inside && /^[[:space:]]*[[:alnum:]_:]+,?$/ {
    gsub(/^[[:space:]]+|,[[:space:]]*$/, ""); print
  }
' "$core/ops_builtin.rs")
op_count=$(printf '%s\n' "$op_list" | sed '/^$/d' | wc -l | tr -d ' ')
[ "$op_count" -eq 99 ] || fail "expected 99 built-in ops, observed $op_count"

rg -q 'extension_set::init_ops\(crate::ops_builtin::BUILTIN_OPS' \
  "$core/runtime/jsruntime.rs" || fail "central JsRuntime registration seam changed"
rg -q 'for ctx in &ops\[\.\.ops_in_snapshot\]' \
  "$core/runtime/bindings.rs" || fail "snapshot external-reference prefix seam changed"
rg -q 'for ctx in &ops\[ops_in_snapshot\.\.\]' \
  "$core/runtime/bindings.rs" || fail "runtime external-reference suffix seam changed"

printf 'decision=GO\n'
printf 'source.commit=%s\n' "$actual_commit"
printf 'deno_core.crate.sha256=%s\n' "$actual_crate"
printf 'registry.file=libs/core/ops_builtin.rs\n'
printf 'registry.builtinOps=%s\n' "$op_count"
printf 'lowerBound.upstreamHandAuthoredFiles=1\n'
printf 'lowerBound.generatedOutputs=0\n'
printf 'threshold.maxUpstreamHandAuthoredFiles=3\n'
printf 'threshold.maxChangedNonCommentLines=200\n'
printf 'snapshot.externalReferencesDerivedFromOpCtxs=1\n'
printf 'requiredOps=op_get_extras_binding_object,op_get_ext_import_meta_proto,op_set_captured_bootstrap\n'

printf '\n[source-sha256]\n'
for relative in \
  ops_builtin.rs \
  ops_builtin_types.rs \
  ops_builtin_v8.rs \
  extension_set.rs \
  runtime/jsruntime.rs \
  runtime/bindings.rs \
  runtime/snapshot.rs \
  00_primordials.js \
  00_infra.js \
  01_core.js \
  02_timers.js
do
  shasum -a 256 "$core/$relative" | sed "s#$core/##"
done

printf '\n[builtin-ops]\n%s\n' "$op_list"
