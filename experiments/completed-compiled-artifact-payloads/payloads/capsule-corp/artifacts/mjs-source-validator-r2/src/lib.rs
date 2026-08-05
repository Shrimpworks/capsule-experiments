//! Unsigned R2 role-specific `.mjs` Source Validator parser children.
//!
//! These binaries parse copied bytes but never execute JavaScript. They own only
//! the fixed v1 parser-child codec and exact Oxc policy observation selected by
//! ADR-0035/0036. They are not signed, installed, enrolled, or product-wired.

use std::{
    io::{self, Read, Write},
    process::ExitCode,
};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ExportAllDeclaration, ExportNamedDeclaration, ImportDeclaration, ImportExpression, MetaProperty,
};
use oxc_ast_visit::{Visit as VisitAst, walk};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use sha2::{Digest, Sha256};

pub const REQUEST_HEADER_BYTES: usize = 216;
pub const SOURCE_MAXIMUM_BYTES: usize = 262_144;
pub const REQUEST_MAXIMUM_BYTES: usize = REQUEST_HEADER_BYTES + SOURCE_MAXIMUM_BYTES;
pub const RESULT_FRAME_BYTES: usize = 248;

const REQUEST_MAGIC: &[u8; 8] = b"CSV1REQ0";
const RESULT_MAGIC: &[u8; 8] = b"CSV1RES0";
const PROTOCOL_VERSION: u16 = 1;
const REQUEST_KIND: u16 = 1;
const RESULT_KIND: u16 = 2;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum Role {
    Daemon = 1,
    ApprovalBroker = 2,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Refusal {
    Malformed,
    Unsupported,
    Domain,
    Binding,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Request<'a> {
    common: [u8; 172],
    source_digest: [u8; 32],
    source: &'a [u8],
}

#[derive(Default)]
struct SyntaxCounts {
    static_import: u32,
    export_from: u32,
    import_expression: u32,
    import_meta: u32,
    overflowed: bool,
}

impl SyntaxCounts {
    fn increment(value: &mut u32, overflowed: &mut bool) {
        if let Some(next) = value.checked_add(1) {
            *value = next;
        } else {
            *overflowed = true;
        }
    }
}

impl<'a> VisitAst<'a> for SyntaxCounts {
    fn visit_import_declaration(&mut self, node: &ImportDeclaration<'a>) {
        Self::increment(&mut self.static_import, &mut self.overflowed);
        walk::walk_import_declaration(self, node);
    }

    fn visit_export_named_declaration(&mut self, node: &ExportNamedDeclaration<'a>) {
        if node.source.is_some() {
            Self::increment(&mut self.export_from, &mut self.overflowed);
        }
        walk::walk_export_named_declaration(self, node);
    }

    fn visit_export_all_declaration(&mut self, node: &ExportAllDeclaration<'a>) {
        Self::increment(&mut self.export_from, &mut self.overflowed);
        walk::walk_export_all_declaration(self, node);
    }

    fn visit_import_expression(&mut self, node: &ImportExpression<'a>) {
        Self::increment(&mut self.import_expression, &mut self.overflowed);
        walk::walk_import_expression(self, node);
    }

    fn visit_meta_property(&mut self, node: &MetaProperty<'a>) {
        if node.meta.name == "import" && node.property.name == "meta" {
            Self::increment(&mut self.import_meta, &mut self.overflowed);
        }
        walk::walk_meta_property(self, node);
    }
}

pub fn run(role: Role) -> ExitCode {
    let mut request = Vec::with_capacity(REQUEST_MAXIMUM_BYTES.min(16 * 1024));
    if io::stdin()
        .take((REQUEST_MAXIMUM_BYTES + 1) as u64)
        .read_to_end(&mut request)
        .is_err()
    {
        return ExitCode::from(74);
    }
    let Ok(result) = validate(&request, role) else {
        return ExitCode::from(65);
    };
    if io::stdout()
        .write_all(&result)
        .and_then(|_| io::stdout().flush())
        .is_err()
    {
        return ExitCode::from(74);
    }
    ExitCode::SUCCESS
}

pub fn validate(request_bytes: &[u8], expected_role: Role) -> Result<Vec<u8>, Refusal> {
    let request = decode_request(request_bytes, expected_role)?;
    let source = std::str::from_utf8(request.source).map_err(|_| Refusal::Domain)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();

    let mut parse = 1;
    let mut policy = 1;
    let mut classification = 0;
    let mut counts = [0; 5];
    if parsed.panicked || !parsed.diagnostics.is_empty() {
        parse = 2;
        policy = 3;
        classification = 4;
    } else {
        let semantic = SemanticBuilder::new()
            .with_check_syntax_error(true)
            .build(&parsed.program);
        if !semantic.diagnostics.is_empty() {
            parse = 3;
            policy = 3;
            classification = 5;
        } else {
            let unresolved = semantic.semantic.scoping().root_unresolved_references();
            let commonjs = ["require", "module", "exports", "__dirname", "__filename"]
                .into_iter()
                .try_fold(0usize, |total, name| {
                    total.checked_add(
                        unresolved
                            .get(name)
                            .map_or(0, |references| references.len()),
                    )
                })
                .ok_or(Refusal::Domain)?;
            let mut syntax = SyntaxCounts::default();
            syntax.visit_program(&parsed.program);
            if syntax.overflowed {
                return Err(Refusal::Domain);
            }
            counts = [
                syntax.static_import,
                syntax.export_from,
                syntax.import_expression,
                syntax.import_meta,
                u32::try_from(commonjs).map_err(|_| Refusal::Domain)?,
            ];
            if counts.iter().any(|count| {
                *count as usize > request.source.len() || *count as usize > SOURCE_MAXIMUM_BYTES
            }) {
                return Err(Refusal::Domain);
            }
            let has_syntax = counts[..4].iter().any(|count| *count != 0);
            let has_commonjs = counts[4] != 0;
            if has_syntax || has_commonjs {
                policy = 2;
                classification = match (has_syntax, has_commonjs) {
                    (true, false) => 1,
                    (false, true) => 2,
                    (true, true) => 3,
                    (false, false) => unreachable!(),
                };
            }
        }
    }
    encode_result(
        &request,
        parse,
        policy,
        classification,
        counts,
        expected_role,
    )
}

fn decode_request(frame: &[u8], role: Role) -> Result<Request<'_>, Refusal> {
    if frame.len() < 12 {
        return Err(Refusal::Malformed);
    }
    if &frame[4..12] == b"CAPMJSRQ" {
        return Err(Refusal::Unsupported);
    }
    if frame.len() < REQUEST_HEADER_BYTES || frame.len() > REQUEST_MAXIMUM_BYTES {
        return Err(Refusal::Malformed);
    }
    if read_u32(frame, 0) as usize + 4 != frame.len() || &frame[4..12] != REQUEST_MAGIC {
        return Err(Refusal::Malformed);
    }
    if read_u16(frame, 12) != PROTOCOL_VERSION {
        return Err(Refusal::Unsupported);
    }
    if read_u16(frame, 14) != REQUEST_KIND || read_u16(frame, 16) != role as u16 {
        return Err(Refusal::Domain);
    }
    for index in 0..11 {
        if read_u16(frame, 18 + index * 2) != (role as u16) * 0x100 + index as u16 + 1 {
            return Err(Refusal::Domain);
        }
    }
    if frame[40..44] != [0; 4] {
        return Err(Refusal::Domain);
    }
    let nonzero = [
        &frame[44..60],
        &frame[60..76],
        &frame[84..116],
        &frame[120..152],
        &frame[152..184],
        &frame[184..216],
    ];
    if nonzero
        .iter()
        .any(|value| value.iter().all(|byte| *byte == 0))
        || read_u64(frame, 76) == 0
    {
        return Err(Refusal::Domain);
    }
    let source_length = read_u32(frame, 116) as usize;
    let source = &frame[REQUEST_HEADER_BYTES..];
    if source_length != source.len() {
        return Err(Refusal::Binding);
    }
    if source.starts_with(&[0xef, 0xbb, 0xbf]) || std::str::from_utf8(source).is_err() {
        return Err(Refusal::Domain);
    }
    let source_digest = sha256(source);
    if source_digest != frame[120..152] {
        return Err(Refusal::Binding);
    }
    let mut common = [0; 172];
    common.copy_from_slice(&frame[44..216]);
    Ok(Request {
        common,
        source_digest,
        source,
    })
}

fn encode_result(
    request: &Request<'_>,
    parse: u8,
    policy: u8,
    classification: u8,
    counts: [u32; 5],
    role: Role,
) -> Result<Vec<u8>, Refusal> {
    let mut frame = vec![0; RESULT_FRAME_BYTES];
    put_u32(&mut frame, 0, (RESULT_FRAME_BYTES - 4) as u32);
    frame[4..12].copy_from_slice(RESULT_MAGIC);
    put_u16(&mut frame, 12, PROTOCOL_VERSION);
    put_u16(&mut frame, 14, RESULT_KIND);
    put_u16(&mut frame, 16, role as u16);
    for index in 0..11 {
        put_u16(
            &mut frame,
            18 + index * 2,
            (role as u16) * 0x100 + index as u16 + 1,
        );
    }
    frame[44..216].copy_from_slice(&request.common);
    frame[216] = parse;
    frame[217] = policy;
    frame[218] = classification;
    frame[219] = 1;
    for (index, count) in counts.iter().enumerate() {
        put_u32(&mut frame, 224 + index * 4, *count);
    }
    if request.source_digest != frame[120..152] {
        return Err(Refusal::Binding);
    }
    Ok(frame)
}

fn sha256(value: &[u8]) -> [u8; 32] {
    Sha256::digest(value).into()
}

fn read_u16(value: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes(value[offset..offset + 2].try_into().expect("fixed offset"))
}

fn read_u32(value: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes(value[offset..offset + 4].try_into().expect("fixed offset"))
}

fn read_u64(value: &[u8], offset: usize) -> u64 {
    u64::from_be_bytes(value[offset..offset + 8].try_into().expect("fixed offset"))
}

fn put_u16(value: &mut [u8], offset: usize, item: u16) {
    value[offset..offset + 2].copy_from_slice(&item.to_be_bytes());
}

fn put_u32(value: &mut [u8], offset: usize, item: u32) {
    value[offset..offset + 4].copy_from_slice(&item.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    fn corpus_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schemas/conformance/v0")
    }

    fn fixture(path: &str) -> Vec<u8> {
        fs::read(corpus_root().join(path)).unwrap()
    }

    #[test]
    fn emits_exact_role_specific_v1_known_answers() {
        for (role, name) in [
            (Role::Daemon, "daemon"),
            (Role::ApprovalBroker, "approval-broker"),
        ] {
            let request = fixture(&format!(
                "mjs-source-validator-v1/{name}/request-ordinary.bin"
            ));
            let result = validate(&request, role).unwrap();
            assert_eq!(
                result,
                fixture(&format!(
                    "mjs-source-validator-v1/{name}/result-ordinary.bin"
                ))
            );
        }
    }

    #[test]
    fn rejects_cross_role_v0_cap_plus_one_and_mutated_bindings() {
        let daemon = fixture("mjs-source-validator-v1/daemon/request-ordinary.bin");
        assert_eq!(
            validate(&daemon, Role::ApprovalBroker),
            Err(Refusal::Domain)
        );
        assert_eq!(
            validate(
                &fixture("mjs-source-validator-v1/daemon/reject-v0-request-as-v1.bin"),
                Role::Daemon
            ),
            Err(Refusal::Unsupported)
        );
        for name in [
            "reject-request-cap-plus-one.bin",
            "reject-request-unknown-version.bin",
        ] {
            assert!(
                validate(
                    &fixture(&format!("mjs-source-validator-v1/daemon/{name}")),
                    Role::Daemon
                )
                .is_err()
            );
        }
    }
}
