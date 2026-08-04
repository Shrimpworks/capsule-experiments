use std::{env, fs, path::Path, process};

const SOURCE_CAP: usize = 262_144;

fn classify(scope: &mut v8::PinScope<'_, '_>, path: &Path) -> String {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return "io_error\tdeny\t0\tunsupported\tunsupported".into(),
    };
    if bytes.len() > SOURCE_CAP {
        return "too_large\tdeny\t0\tunsupported\tunsupported".into();
    }
    let source = match std::str::from_utf8(&bytes) {
        Ok(source) => source,
        Err(_) => return "invalid_utf8\tdeny\t0\tunsupported\tunsupported".into(),
    };
    let Some(source_text) = v8::String::new(scope, source) else {
        return "local_failure\tdeny\t0\tunsupported\tunsupported".into();
    };
    let resource_name = v8::String::new(scope, "main.mjs").expect("fixed resource name");
    let origin = v8::ScriptOrigin::new(
        scope,
        resource_name.into(),
        0,
        0,
        false,
        0,
        None,
        false,
        false,
        true,
        None,
    );
    let mut source = v8::script_compiler::Source::new(source_text, Some(&origin));
    let Some(module) = v8::script_compiler::compile_module(scope, &mut source) else {
        return "parse_error\tdeny\t0\tunsupported\tunsupported".into();
    };
    let static_requests = module.get_module_requests().length();
    let policy = if static_requests == 0 {
        "indeterminate"
    } else {
        "deny"
    };
    format!("valid\t{policy}\t{static_requests}\tunsupported\tunsupported")
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args == ["--fault=hang"] {
        std::thread::park();
    }
    if args == ["--fault=abort"] {
        process::abort();
    }
    if args.is_empty() {
        process::exit(64);
    }
    let platform = v8::new_default_platform(0, false).make_shared();
    v8::V8::initialize_platform(platform);
    v8::V8::initialize();
    let isolate = &mut v8::Isolate::new(Default::default());
    v8::scope!(let scope, isolate);
    let context = v8::Context::new(scope, Default::default());
    let scope = &mut v8::ContextScope::new(scope, context);
    for path in args {
        println!(
            "{}\t{}",
            Path::new(&path).display(),
            classify(scope, Path::new(&path))
        );
    }
}
