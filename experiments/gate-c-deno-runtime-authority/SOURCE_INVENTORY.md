# Construction and source inventory

This inventory describes the exact `deno_core` 0.409.0 construction tested on 2026-08-02. The
prototype is development evidence under `experiments/`; product packages must not import it.

## Capsule construction

The trusted Rust wrapper:

- accepts only `--source FILE --input FILE [--manifest]`;
- reads UTF-8 regular files with independent 64 KiB source/input caps;
- parses input and output as exact JSON and caps output at 64 KiB;
- registers one middleware-only extension, `capsule_builtin_gate`, with no Capsule ops or JS files;
- passes `module_loader: None` (therefore `NoopModuleLoader`) and `inspector: false`;
- fixes V8 flags to `--jitless --random-seed=42` before runtime creation;
- loads only the bounded entry bytes as `file:///capsule/workload.js` and executes one ESM main;
- exposes input only by a JSON value embedded into the trusted wrapper and emits one JSON line;
- performs no runtime filesystem, network, process, FFI, Node/npm, Worker, inspector, or persistent
  storage registration.

After the construction manifest is captured, the wrapper deletes `Deno`, `__bootstrap`, `console`,
`Atomics`, `Date`, `Intl`, `SharedArrayBuffer`, and `Temporal`, and fixes those selected names to
`undefined`. V8 `--jitless` leaves WebAssembly unavailable. This scrub is defense in depth; it
does not make the built-in ops physically absent.

## Built-in core operation table

`JsRuntime` physically registered these 99 names before extension middleware ran:

```text
op_abort_wasm_streaming
op_add
op_add_async
op_add_main_module_handler
op_cancel_handle
op_cancel_read
op_close
op_compile_function
op_current_user_call_site
op_decode
op_deserialize
op_destructure_error
op_dispatch_exception
op_drain_pending_rejections
op_encode
op_encode_binary_string
op_error_async
op_error_async_deferred
op_eval_context
op_event_loop_has_more_work
op_get_constructor_name
op_get_ext_import_meta_proto
op_get_extras_binding_object
op_get_non_index_property_names
op_get_promise_details
op_get_proxy_details
op_immediate_check
op_import_sync
op_import_sync_with_source
op_is_any_array_buffer
op_is_arguments_object
op_is_array_buffer
op_is_array_buffer_view
op_is_async_function
op_is_big_int_object
op_is_boolean_object
op_is_boxed_primitive
op_is_data_view
op_is_date
op_is_generator_function
op_is_generator_object
op_is_map
op_is_map_iterator
op_is_module_namespace_object
op_is_native_error
op_is_number_object
op_is_promise
op_is_proxy
op_is_reg_exp
op_is_set
op_is_set_iterator
op_is_shared_array_buffer
op_is_string_object
op_is_symbol_object
op_is_terminal
op_is_typed_array
op_is_weak_map
op_is_weak_set
op_lazy_load_esm
op_leak_tracing_enable
op_leak_tracing_get
op_leak_tracing_get_all
op_leak_tracing_submit
op_load_ext_script
op_memory_usage
op_op_names
op_panic
op_pipe
op_print
op_read
op_read_all
op_read_sync
op_ref_op
op_resources
op_run_microtasks
op_serialize
op_set_captured_bootstrap
op_set_format_exception_callback
op_set_handled_promise_rejection_handler
op_set_promise_hooks
op_set_wasm_streaming_callback
op_shutdown
op_str_byte_length
op_structured_clone
op_timer_now
op_timer_schedule
op_timer_track
op_timer_untrack
op_try_close
op_unref_op
op_void_async
op_void_async_deferred
op_void_sync
op_wasm_streaming_feed
op_wasm_streaming_set_url
op_write
op_write_all
op_write_sync
op_write_type_error
```

The middleware left only `op_get_extras_binding_object`, `op_get_ext_import_meta_proto`, and
`op_set_captured_bootstrap` enabled because the selected core bootstrap required them. It called
`op.disable()` for the other 96. Sampled calls to `op_print`, `op_panic`, and `op_memory_usage`
threw `Error`, but the names, generated bindings, external references, and native functions remained
registered. This violates the experiment's physical explicit-op requirement and triggered NO-GO.

## Observed bootstrap/global surface

Before the scrub, the exact non-symbol own global names were:

```text
AggregateError Array ArrayBuffer AsyncDisposableStack Atomics BigInt BigInt64Array
BigUint64Array Boolean DataView Date Deno DisposableStack Error EvalError
FinalizationRegistry Float16Array Float32Array Float64Array Function Infinity Int16Array
Int32Array Int8Array Intl Iterator JSON Map Math NaN Number Object Promise Proxy RangeError
ReferenceError Reflect RegExp Set SharedArrayBuffer String SuppressedError Symbol SyntaxError
Temporal TypeError URIError Uint16Array Uint32Array Uint8Array Uint8ClampedArray WeakMap WeakRef
WeakSet __bootstrap console decodeURI decodeURIComponent encodeURI encodeURIComponent escape eval
globalThis isFinite isNaN parseFloat parseInt queueMicrotask undefined unescape
```

`__bootstrap` contained `core`, `internals`, and `primordials`. Worker and WebAssembly were absent.
`RuntimeOptions.inspector` was exactly `false`, so the prototype created no inspector handle or
session; `deno_core`/V8 inspector implementation remains linked upstream surface, and the
construction mutation gate refuses activation.
The main module still has ordinary ECMAScript `eval` and `Function`; bounded deterministic semantics
beyond the authority question remain future profile work.

## Upstream source surface reviewed

The official v2.9.4 source archive expanded to 17,257 files / 152,300 KiB. `libs/core` contained
126 files / 68,711 Rust+JavaScript lines. Review focused on:

- `libs/core/runtime/jsruntime.rs`: `JsRuntime` creation, built-in operation registration, module
  loader default, inspector choice, snapshot and extension ordering;
- `libs/core/ops_builtin.rs`: built-in op declarations and middleware disable behavior;
- `libs/core/01_core.js` and bootstrap modules: core namespace/bootstrap dependencies;
- generated op bindings and fast-call disable paths;
- `cli/lib/worker.rs`: full-Deno permissions, SIGUSR1 inspector path, bootstrap and compatibility
  extension construction;
- `runtime/ops/worker_host.rs`: Worker construction;
- `ext/webstorage/lib.rs` and `ext/cache/sqlite.rs`: internal persistence paths;
- workspace `Cargo.toml`, `Cargo.lock`, and `rust-toolchain.toml`: exact dependency/toolchain pins.

Run `scripts/source-inventory.sh /path/to/deno-v2.9.4-source` to verify the selected version pins and
print content hashes for the security-relevant source files. The experiment does not claim that
this focused inventory is a complete audit of the 193-package prototype graph or V8.

## Snapshot disposition

No custom startup snapshot is retained. A snapshot can bind an exact extension set/order and improve
startup, but it does not make the 96 disabled built-ins physically absent or prove the middleware's
native fast-call semantics. Snapshot review and byte-for-byte two-build comparison are intentionally
deferred until a governed source construction physically omits nonessential built-ins.
