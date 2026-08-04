use std::{env, fs, path::Path, process};

use tree_sitter::{Node, Parser};

const SOURCE_CAP: usize = 262_144;

#[derive(Default)]
struct Counts {
    static_import: usize,
    export_from: usize,
    import_expression: usize,
    import_meta: usize,
}

fn walk(node: Node<'_>, counts: &mut Counts) {
    match node.kind() {
        "import_statement" => counts.static_import += 1,
        "export_statement" if node.child_by_field_name("source").is_some() => {
            counts.export_from += 1;
        }
        "call_expression"
            if node
                .child_by_field_name("function")
                .is_some_and(|child| child.kind() == "import") =>
        {
            counts.import_expression += 1;
        }
        "meta_property" => counts.import_meta += 1,
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk(child, counts);
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
    if std::str::from_utf8(&bytes).is_err() {
        return "invalid_utf8\tdeny\t0\t0\t0\t0".into();
    }
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_javascript::LANGUAGE.into())
        .expect("pinned grammar ABI");
    let Some(tree) = parser.parse(&bytes, None) else {
        return "parse_error\tdeny\t0\t0\t0\t0".into();
    };
    if tree.root_node().has_error() {
        return "parse_error\tdeny\t0\t0\t0\t0".into();
    }
    let mut counts = Counts::default();
    walk(tree.root_node(), &mut counts);
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
