use std::error::Error;
use std::fs;
use std::sync::Arc;

use deno_ast::DecoratorsTranspileOption;
use deno_ast::EmitOptions;
use deno_ast::ImportsNotUsedAsValues;
use deno_ast::MediaType;
use deno_ast::ModuleKind;
use deno_ast::ModuleSpecifier;
use deno_ast::ParseParams;
use deno_ast::SourceMapOption;
use deno_ast::TranspileModuleOptions;
use deno_ast::TranspileOptions;
use deno_ast::parse_module;

const MAX_SOURCE_BYTES: usize = 262_144;
const MAX_EMITTED_BYTES: usize = 262_144;

fn main() -> Result<(), Box<dyn Error>> {
    let path = std::env::args().nth(1).ok_or("usage: comparison SOURCE")?;
    let bytes = fs::read(path)?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("SOURCE_CAP".into());
    }
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return Err("SOURCE_BOM".into());
    }
    let source = String::from_utf8(bytes)?;
    let parsed = parse_module(ParseParams {
        specifier: ModuleSpecifier::parse("file:///capsule/workload.ts")?,
        text: Arc::from(source),
        media_type: MediaType::TypeScript,
        capture_tokens: false,
        scope_analysis: false,
        maybe_syntax: None,
    })?;
    if !parsed.diagnostics().is_empty() {
        return Err("DIAGNOSTIC".into());
    }
    let output = parsed
        .transpile(
            &TranspileOptions {
                decorators: DecoratorsTranspileOption::None,
                verbatim_module_syntax: true,
                imports_not_used_as_values: ImportsNotUsedAsValues::Remove,
                jsx: None,
                var_decl_imports: false,
            },
            &TranspileModuleOptions {
                module_kind: Some(ModuleKind::Esm),
            },
            &EmitOptions {
                source_map: SourceMapOption::None,
                source_map_base: None,
                source_map_file: None,
                inline_sources: false,
                remove_comments: false,
            },
        )?
        .into_source();
    if output.source_map.is_some() {
        return Err("SOURCE_MAP".into());
    }
    if output.text.len() > MAX_EMITTED_BYTES {
        return Err("EMITTED_CAP".into());
    }
    print!("{}", output.text);
    Ok(())
}
