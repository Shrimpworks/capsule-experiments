use std::{env, fs, path::Path, process, sync::Arc};

use deno_ast::swc::ast::{
    CallExpr, Callee, ExportAll, ImportDecl, MetaPropExpr, MetaPropKind, NamedExport,
};
use deno_ast::swc::ecma_visit::{Visit, VisitWith};
use deno_ast::{MediaType, ModuleSpecifier, ParseParams, parse_module};

const SOURCE_CAP: usize = 262_144;

#[derive(Default)]
struct Counts {
    static_import: usize,
    export_from: usize,
    import_expression: usize,
    import_meta: usize,
}

impl Visit for Counts {
    fn visit_import_decl(&mut self, node: &ImportDecl) {
        self.static_import += 1;
        node.visit_children_with(self);
    }

    fn visit_named_export(&mut self, node: &NamedExport) {
        if node.src.is_some() {
            self.export_from += 1;
        }
        node.visit_children_with(self);
    }

    fn visit_export_all(&mut self, node: &ExportAll) {
        self.export_from += 1;
        node.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, node: &CallExpr) {
        if matches!(node.callee, Callee::Import(_)) {
            self.import_expression += 1;
        }
        node.visit_children_with(self);
    }

    fn visit_meta_prop_expr(&mut self, node: &MetaPropExpr) {
        if node.kind == MetaPropKind::ImportMeta {
            self.import_meta += 1;
        }
        node.visit_children_with(self);
    }
}

fn classify(path: &Path) -> String {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return "io_error\tdeny\t0\t0\t0\t0".into(),
    };
    if bytes.len() > SOURCE_CAP {
        return "too_large\tdeny\t0\t0\t0\t0".into();
    }
    let source = match String::from_utf8(bytes) {
        Ok(source) => source,
        Err(_) => return "invalid_utf8\tdeny\t0\t0\t0\t0".into(),
    };
    let parsed = match parse_module(ParseParams {
        specifier: ModuleSpecifier::parse("file:///main.mjs").expect("fixed specifier"),
        text: Arc::from(source),
        media_type: MediaType::Mjs,
        capture_tokens: false,
        scope_analysis: false,
        maybe_syntax: None,
    }) {
        Ok(parsed) => parsed,
        Err(_) => return "parse_error\tdeny\t0\t0\t0\t0".into(),
    };
    let mut counts = Counts::default();
    parsed.program_ref().visit_with(&mut counts);
    let policy = if counts.static_import
        + counts.export_from
        + counts.import_expression
        + counts.import_meta
        == 0
    {
        "allow"
    } else {
        "deny"
    };
    format!(
        "valid\t{policy}\t{}\t{}\t{}\t{}",
        counts.static_import, counts.export_from, counts.import_expression, counts.import_meta
    )
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
    for path in args {
        println!(
            "{}\t{}",
            Path::new(&path).display(),
            classify(Path::new(&path))
        );
    }
}
