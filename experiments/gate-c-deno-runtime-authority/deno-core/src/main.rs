// Development-only Capsule feasibility probe. This is not product runtime code.

use deno_core::Extension;
use deno_core::JsRuntime;
use deno_core::RuntimeOptions;
use deno_core::v8;
use serde_json::Value;
use serde_json::json;
use std::env;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

fn bounded_read(path: &Path, limit: usize, role: &str) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("{role} metadata: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("{role} is not a regular file"));
    }
    if metadata.len() > limit as u64 {
        return Err(format!("{role} exceeds {limit} bytes"));
    }
    let bytes = fs::read(path).map_err(|error| format!("{role} read: {error}"))?;
    if bytes.len() > limit {
        return Err(format!("{role} exceeds {limit} bytes"));
    }
    String::from_utf8(bytes).map_err(|error| format!("{role} is not UTF-8: {error}"))
}

fn execute_string(
    runtime: &mut JsRuntime,
    name: &'static str,
    source: String,
) -> Result<String, String> {
    let value = runtime
        .execute_script(name, source)
        .map_err(|error| format!("JavaScript execution: {error}"))?;
    deno_core::scope!(scope, runtime);
    let local = v8::Local::new(scope, value);
    let string = local
        .to_string(scope)
        .ok_or_else(|| "JavaScript result is not string-coercible".to_string())?;
    Ok(string.to_rust_string_lossy(scope))
}

fn construction(runtime: &mut JsRuntime) -> Result<Value, String> {
    let raw = execute_string(
        runtime,
        "capsule:construction",
        r#"JSON.stringify({
          globals: Reflect.ownKeys(globalThis).map(String).sort(),
          coreOps: globalThis.Deno?.core?.ops
            ? Reflect.ownKeys(globalThis.Deno.core.ops).map(String).sort()
            : [],
          bootstrapKeys: globalThis.__bootstrap
            ? Reflect.ownKeys(globalThis.__bootstrap).map(String).sort()
            : [],
          hasWorker: typeof globalThis.Worker !== "undefined",
          hasWebAssembly: typeof globalThis.WebAssembly !== "undefined",
          disabledOpBehavior: Object.fromEntries([
            "op_print", "op_panic", "op_memory_usage"
          ].map((name) => {
            try {
              globalThis.Deno.core.ops[name]("CAPSULE_DISABLED_OP_PROBE", false);
              return [name, "returned"];
            } catch (error) {
              return [name, `threw:${error?.name ?? typeof error}`];
            }
          }))
        })"#
        .to_string(),
    )?;
    serde_json::from_str(&raw).map_err(|error| format!("construction JSON: {error}"))
}

fn seal_core(runtime: &mut JsRuntime) -> Result<(), String> {
    execute_string(
        runtime,
        "capsule:seal",
        r#"(() => {
          if (globalThis.Deno && Object.prototype.hasOwnProperty.call(globalThis.Deno, "core")) {
            delete globalThis.Deno.core;
          }
          delete globalThis.Deno;
          delete globalThis.__bootstrap;
          delete globalThis.console;
          for (const name of ["Atomics", "Date", "Intl", "SharedArrayBuffer", "Temporal"]) {
            delete globalThis[name];
            Object.defineProperty(globalThis, name, {
              value: undefined,
              writable: false,
              configurable: false,
              enumerable: false
            });
          }
          Object.defineProperty(globalThis, "Deno", {
            value: undefined,
            writable: false,
            configurable: false,
            enumerable: false
          });
          return "sealed";
        })()"#
            .to_string(),
    )?;
    Ok(())
}

fn usage() -> String {
    "usage: capsule-deno-core-probe --source FILE --input FILE [--manifest]".to_string()
}

fn main() -> Result<(), String> {
    let mut source_path: Option<PathBuf> = None;
    let mut input_path: Option<PathBuf> = None;
    let mut print_manifest = false;
    let mut args = env::args_os().skip(1);
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--source") => source_path = args.next().map(Into::into),
            Some("--input") => input_path = args.next().map(Into::into),
            Some("--manifest") => print_manifest = true,
            _ => return Err(usage()),
        }
    }
    let source_path = source_path.ok_or_else(usage)?;
    let input_path = input_path.ok_or_else(usage)?;

    let mutation_keys = [
        "CAPSULE_MUTATION_ENABLE_OP",
        "CAPSULE_MUTATION_EXTENSION",
        "CAPSULE_MUTATION_INSPECTOR",
        "CAPSULE_MUTATION_MODULE_LOADER",
        "CAPSULE_MUTATION_REMOVE_JITLESS",
    ];
    let requested_mutations = mutation_keys
        .iter()
        .filter_map(|key| env::var(key).ok().map(|value| (*key, value)))
        .collect::<Vec<_>>();
    if !requested_mutations.is_empty() {
        return Err(format!(
            "construction manifest refused mutations: {requested_mutations:?}"
        ));
    }

    let source = bounded_read(source_path.as_ref(), MAX_SOURCE_BYTES, "source")?;
    let input_text = bounded_read(input_path.as_ref(), MAX_INPUT_BYTES, "input")?;
    let input: Value =
        serde_json::from_str(&input_text).map_err(|error| format!("input JSON: {error}"))?;

    let fixed_v8_flags = vec![
        "capsule-deno-core-probe".to_string(),
        "--jitless".to_string(),
        "--random-seed=42".to_string(),
    ];
    let unrecognized = deno_core::v8_set_flags(fixed_v8_flags.clone());
    if unrecognized != vec![fixed_v8_flags[0].clone()] {
        return Err(format!("unrecognized V8 flags: {unrecognized:?}"));
    }

    let builtin_gate = Extension {
        name: "capsule_builtin_gate",
        middleware_fn: Some(Box::new(|op| match op.name {
            "op_get_extras_binding_object"
            | "op_get_ext_import_meta_proto"
            | "op_set_captured_bootstrap" => op,
            _ => op.disable(),
        })),
        ..Default::default()
    };
    let mut runtime = JsRuntime::new(RuntimeOptions {
        extensions: vec![builtin_gate],
        module_loader: None,
        inspector: false,
        ..Default::default()
    });
    let observed = construction(&mut runtime)?;
    let manifest = json!({
        "schema": "capsule.deno-core-construction.v0",
        "denoCore": "0.409.0",
        "customSnapshot": false,
        "extensions": ["capsule_builtin_gate"],
        "builtinOps": {"total": 99, "enabled": [
          "op_get_extras_binding_object",
          "op_get_ext_import_meta_proto",
          "op_set_captured_bootstrap"
        ], "disabled": 96},
        "moduleLoader": "none",
        "inspector": false,
        "v8Flags": fixed_v8_flags.into_iter().skip(1).collect::<Vec<_>>(),
        "observed": observed
    });
    if print_manifest {
        println!("{}", serde_json::to_string_pretty(&manifest).unwrap());
    }

    seal_core(&mut runtime)?;
    let input_literal = serde_json::to_string(&input).unwrap();
    let input_literal_literal = serde_json::to_string(&input_literal).unwrap();
    let wrapper = format!(
        "{source}\nglobalThis.__capsule_result = JSON.stringify(await globalThis.capsuleMain(JSON.parse({input_literal_literal})));"
    );
    let specifier = deno_core::resolve_url("file:///capsule/workload.js")
        .map_err(|error| format!("workload specifier: {error}"))?;
    let module_id = deno_core::futures::executor::block_on(
        runtime.load_main_es_module_from_code(&specifier, wrapper),
    )
    .map_err(|error| format!("module load: {error}"))?;
    let evaluation = runtime.mod_evaluate(module_id);
    deno_core::futures::executor::block_on(runtime.run_event_loop(Default::default()))
        .map_err(|error| format!("event loop: {error}"))?;
    deno_core::futures::executor::block_on(evaluation)
        .map_err(|error| format!("module evaluation: {error}"))?;
    let output = execute_string(
        &mut runtime,
        "capsule:result",
        "globalThis.__capsule_result".to_string(),
    )?;
    if output.len() > MAX_OUTPUT_BYTES {
        return Err(format!("output exceeds {MAX_OUTPUT_BYTES} bytes"));
    }
    let value: Value =
        serde_json::from_str(&output).map_err(|error| format!("output JSON: {error}"))?;
    println!("{}", serde_json::to_string(&value).unwrap());
    Ok(())
}
