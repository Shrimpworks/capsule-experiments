use std::{env, fs, path::Path, process};

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit as VisitAst, walk};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;

const SOURCE_CAP: usize = 262_144;

#[derive(Default)]
struct Counts {
    static_import: usize,
    export_from: usize,
    import_expression: usize,
    import_meta: usize,
}

impl<'a> VisitAst<'a> for Counts {
    fn visit_import_declaration(&mut self, node: &ImportDeclaration<'a>) {
        self.static_import += 1;
        walk::walk_import_declaration(self, node);
    }

    fn visit_export_named_declaration(&mut self, node: &ExportNamedDeclaration<'a>) {
        if node.source.is_some() {
            self.export_from += 1;
        }
        walk::walk_export_named_declaration(self, node);
    }

    fn visit_export_all_declaration(&mut self, node: &ExportAllDeclaration<'a>) {
        self.export_from += 1;
        walk::walk_export_all_declaration(self, node);
    }

    fn visit_import_expression(&mut self, node: &ImportExpression<'a>) {
        self.import_expression += 1;
        walk::walk_import_expression(self, node);
    }

    fn visit_meta_property(&mut self, node: &MetaProperty<'a>) {
        if node.meta.name == "import" && node.property.name == "meta" {
            self.import_meta += 1;
        }
        walk::walk_meta_property(self, node);
    }
}

fn classify(path: &Path, include_commonjs_count: bool) -> String {
    let suffix = if include_commonjs_count { "\t0" } else { "" };
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return format!("io_error\tdeny\t0\t0\t0\t0{suffix}"),
    };
    if bytes.len() > SOURCE_CAP {
        return format!("too_large\tdeny\t0\t0\t0\t0{suffix}");
    }
    let source = match std::str::from_utf8(&bytes) {
        Ok(source) => source,
        Err(_) => return format!("invalid_utf8\tdeny\t0\t0\t0\t0{suffix}"),
    };

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if parsed.panicked || !parsed.diagnostics.is_empty() {
        return format!("parse_error\tdeny\t0\t0\t0\t0{suffix}");
    }
    let semantic = SemanticBuilder::new()
        .with_check_syntax_error(true)
        .build(&parsed.program);
    if !semantic.diagnostics.is_empty() {
        return format!("parse_error\tdeny\t0\t0\t0\t0{suffix}");
    }

    let unresolved = semantic.semantic.scoping().root_unresolved_references();
    let commonjs_references = ["require", "module", "exports", "__dirname", "__filename"]
        .into_iter()
        .map(|name| {
            unresolved
                .get(name)
                .map_or(0, |references| references.len())
        })
        .sum::<usize>();

    let mut counts = Counts::default();
    counts.visit_program(&parsed.program);
    let policy = if counts.static_import
        + counts.export_from
        + counts.import_expression
        + counts.import_meta
        + commonjs_references
        == 0
    {
        "allow"
    } else {
        "deny"
    };
    let classification = format!(
        "valid\t{policy}\t{}\t{}\t{}\t{}",
        counts.static_import, counts.export_from, counts.import_expression, counts.import_meta
    );
    if include_commonjs_count {
        format!("{classification}\t{commonjs_references}")
    } else {
        classification
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args == ["--fault=hang"] {
        std::thread::park();
    }
    if args == ["--fault=abort"] {
        process::abort();
    }
    let include_commonjs_count = args.first().is_some_and(|arg| arg == "--m1-hold");
    let paths = if include_commonjs_count {
        &args[1..]
    } else {
        &args[..]
    };
    if paths.is_empty() {
        process::exit(64);
    }
    for path in paths {
        println!(
            "{}\t{}",
            Path::new(&path).display(),
            classify(Path::new(&path), include_commonjs_count)
        );
    }
}
