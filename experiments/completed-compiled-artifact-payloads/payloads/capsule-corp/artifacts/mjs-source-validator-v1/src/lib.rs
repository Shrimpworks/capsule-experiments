//! Unwired V1 `.mjs` Source Validator artifact.
//!
//! This crate parses copied bytes but never executes JavaScript. It owns only the
//! fixed V0 request/result codec and the exact Oxc policy observation selected by
//! ADR-0035. Launch confinement and parent authority decisions remain later gates.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ExportAllDeclaration, ExportNamedDeclaration, ImportDeclaration, ImportExpression, MetaProperty,
};
use oxc_ast_visit::{Visit as VisitAst, walk};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use sha2::{Digest, Sha256};

pub const REQUEST_HEADER_BYTES: usize = 80;
pub const SOURCE_MAXIMUM_BYTES: usize = 262_144;
pub const REQUEST_MAXIMUM_BYTES: usize = REQUEST_HEADER_BYTES + SOURCE_MAXIMUM_BYTES;
pub const RESULT_FRAME_BYTES: usize = 138;

const REQUEST_MAGIC: &[u8; 8] = b"CAPMJSRQ";
const RESULT_MAGIC: &[u8; 8] = b"CAPMJSRS";
const PROTOCOL_VERSION: u16 = 0;
const REQUEST_KIND: u16 = 1;
const RESULT_KIND: u16 = 2;
const METHOD: u16 = 1;
const VALIDATOR_PROFILE: u16 = 1;
const SOURCE_PROFILE: u16 = 1;
const SOURCE_MEDIA: u16 = 1;
const CORRELATION_DOMAIN: u16 = 1;
const SOURCE_DIGEST_DOMAIN: u16 = 0x0101;
const ARTIFACT_PROFILE_DIGEST_DOMAIN: u16 = 0x0106;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Refusal {
    Malformed,
    Unsupported,
    Domain,
    Binding,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request<'a> {
    pub correlation_id: [u8; 16],
    pub source_digest: [u8; 32],
    pub source: &'a [u8],
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResultFrame {
    pub correlation_id: [u8; 16],
    pub source_length: u32,
    pub source_digest: [u8; 32],
    pub artifact_profile_digest: [u8; 32],
    pub parse: u8,
    pub policy: u8,
    pub classification: u8,
    pub counts: [u32; 5],
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

pub fn validate(
    request_bytes: &[u8],
    artifact_profile_digest: [u8; 32],
) -> Result<Vec<u8>, Refusal> {
    if artifact_profile_digest == [0; 32] {
        return Err(Refusal::Domain);
    }
    let request = decode_request(request_bytes)?;
    let source = std::str::from_utf8(request.source).map_err(|_| Refusal::Domain)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();

    let mut result = ResultFrame {
        correlation_id: request.correlation_id,
        source_length: request.source.len() as u32,
        source_digest: request.source_digest,
        artifact_profile_digest,
        parse: 1,
        policy: 1,
        classification: 0,
        counts: [0; 5],
    };

    if parsed.panicked || !parsed.diagnostics.is_empty() {
        result.parse = 2;
        result.policy = 3;
        result.classification = 4;
        return encode_result(&result);
    }

    let semantic = SemanticBuilder::new()
        .with_check_syntax_error(true)
        .build(&parsed.program);
    if !semantic.diagnostics.is_empty() {
        result.parse = 3;
        result.policy = 3;
        result.classification = 5;
        return encode_result(&result);
    }

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
    let counts = [
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
    result.counts = counts;
    let has_syntax = counts[..4].iter().any(|count| *count != 0);
    let has_commonjs = counts[4] != 0;
    if has_syntax || has_commonjs {
        result.policy = 2;
        result.classification = match (has_syntax, has_commonjs) {
            (true, false) => 1,
            (false, true) => 2,
            (true, true) => 3,
            (false, false) => unreachable!(),
        };
    }
    encode_result(&result)
}

pub fn decode_request(frame: &[u8]) -> Result<Request<'_>, Refusal> {
    if frame.len() < 4 {
        return Err(Refusal::Malformed);
    }
    let declared = read_u32(frame, 0) as usize + 4;
    if declared > REQUEST_MAXIMUM_BYTES {
        return Err(Refusal::Domain);
    }
    if declared < REQUEST_HEADER_BYTES || declared != frame.len() {
        return Err(Refusal::Malformed);
    }
    if &frame[4..12] != REQUEST_MAGIC {
        return Err(Refusal::Domain);
    }
    let expected = [
        PROTOCOL_VERSION,
        REQUEST_KIND,
        METHOD,
        VALIDATOR_PROFILE,
        SOURCE_PROFILE,
        SOURCE_MEDIA,
        CORRELATION_DOMAIN,
        SOURCE_DIGEST_DOMAIN,
    ];
    for (index, value) in expected.iter().enumerate() {
        if read_u16(frame, 12 + index * 2) != *value {
            return Err(if index >= 6 {
                Refusal::Domain
            } else {
                Refusal::Unsupported
            });
        }
    }
    let correlation_id = array::<16>(&frame[28..44]);
    if correlation_id == [0; 16] {
        return Err(Refusal::Domain);
    }
    let source_length = read_u32(frame, 44) as usize;
    let source = &frame[REQUEST_HEADER_BYTES..];
    if source_length > SOURCE_MAXIMUM_BYTES {
        return Err(Refusal::Domain);
    }
    if source_length != source.len() {
        return Err(Refusal::Binding);
    }
    if source.starts_with(&[0xef, 0xbb, 0xbf]) || std::str::from_utf8(source).is_err() {
        return Err(Refusal::Domain);
    }
    let source_digest = sha256(source);
    if source_digest != frame[48..80] {
        return Err(Refusal::Binding);
    }
    Ok(Request {
        correlation_id,
        source_digest,
        source,
    })
}

pub fn encode_result(result: &ResultFrame) -> Result<Vec<u8>, Refusal> {
    validate_result(result)?;
    let mut frame = vec![0; RESULT_FRAME_BYTES];
    put_u32(&mut frame, 0, (RESULT_FRAME_BYTES - 4) as u32);
    frame[4..12].copy_from_slice(RESULT_MAGIC);
    for (index, value) in [
        PROTOCOL_VERSION,
        RESULT_KIND,
        METHOD,
        VALIDATOR_PROFILE,
        SOURCE_PROFILE,
        SOURCE_MEDIA,
        CORRELATION_DOMAIN,
        SOURCE_DIGEST_DOMAIN,
    ]
    .iter()
    .enumerate()
    {
        put_u16(&mut frame, 12 + index * 2, *value);
    }
    frame[28..44].copy_from_slice(&result.correlation_id);
    put_u32(&mut frame, 44, result.source_length);
    frame[48..80].copy_from_slice(&result.source_digest);
    put_u16(&mut frame, 80, ARTIFACT_PROFILE_DIGEST_DOMAIN);
    frame[82..114].copy_from_slice(&result.artifact_profile_digest);
    frame[114] = result.parse;
    frame[115] = result.policy;
    frame[116] = result.classification;
    for (index, count) in result.counts.iter().enumerate() {
        put_u32(&mut frame, 118 + index * 4, *count);
    }
    Ok(frame)
}

fn validate_result(result: &ResultFrame) -> Result<(), Refusal> {
    if result.correlation_id == [0; 16]
        || result.artifact_profile_digest == [0; 32]
        || result.source_length as usize > SOURCE_MAXIMUM_BYTES
        || result
            .counts
            .iter()
            .any(|count| *count > result.source_length || *count as usize > SOURCE_MAXIMUM_BYTES)
    {
        return Err(Refusal::Domain);
    }
    let syntax = result.counts[..4].iter().any(|count| *count != 0);
    let commonjs = result.counts[4] != 0;
    let coherent = match result.parse {
        1 => matches!(
            (result.policy, result.classification, syntax, commonjs),
            (1, 0, false, false) | (2, 1, true, false) | (2, 2, false, true) | (2, 3, true, true)
        ),
        2 => result.policy == 3 && result.classification == 4 && !syntax && !commonjs,
        3 => result.policy == 3 && result.classification == 5 && !syntax && !commonjs,
        _ => false,
    };
    coherent.then_some(()).ok_or(Refusal::Domain)
}

pub fn artifact_profile_identity_digest(profile: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(b"capsule.source-validator.artifact-profile/v0");
    hash.update([0]);
    hash.update(profile);
    hash.finalize().into()
}

pub fn parse_hex_digest(value: &str) -> Result<[u8; 32], Refusal> {
    if value.len() != 64 {
        return Err(Refusal::Malformed);
    }
    let mut digest = [0; 32];
    for (index, item) in digest.iter_mut().enumerate() {
        *item = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|_| Refusal::Malformed)?;
    }
    if digest == [0; 32] {
        return Err(Refusal::Domain);
    }
    Ok(digest)
}

fn sha256(value: &[u8]) -> [u8; 32] {
    Sha256::digest(value).into()
}

fn read_u16(value: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes(array::<2>(&value[offset..offset + 2]))
}

fn read_u32(value: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes(array::<4>(&value[offset..offset + 4]))
}

fn put_u16(value: &mut [u8], offset: usize, item: u16) {
    value[offset..offset + 2].copy_from_slice(&item.to_be_bytes());
}

fn put_u32(value: &mut [u8], offset: usize, item: u32) {
    value[offset..offset + 4].copy_from_slice(&item.to_be_bytes());
}

fn array<const N: usize>(value: &[u8]) -> [u8; N] {
    value.try_into().expect("fixed offset")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    fn fixture(path: &str) -> Vec<u8> {
        fs::read(corpus_root().join(path)).unwrap()
    }

    fn corpus_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schemas/conformance/v0")
    }

    #[test]
    fn emits_exact_v0_ordinary_result() {
        let profile = fixture("mjs-source-validator/artifact-profile.bin");
        let result = validate(
            &fixture("mjs-source-validator/request-ordinary.bin"),
            artifact_profile_identity_digest(&profile),
        )
        .unwrap();
        assert_eq!(result, fixture("mjs-source-validator/result-ordinary.bin"));
    }

    #[test]
    fn emits_all_exact_v0_m1_hold_results() {
        let profile = fixture("mjs-source-validator/artifact-profile.bin");
        let profile_digest = artifact_profile_identity_digest(&profile);
        let source_dir = corpus_root().join("mjs-source");
        let mut names = fs::read_dir(source_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .filter(|name| name.starts_with("language-hold-") && name.ends_with(".mjs"))
            .collect::<Vec<_>>();
        names.sort();
        assert_eq!(names.len(), 28);
        for name in names {
            let stem = name
                .trim_start_matches("language-")
                .trim_end_matches(".mjs");
            let request = fixture(&format!("mjs-source-validator/request-{stem}.bin"));
            let expected = fixture(&format!("mjs-source-validator/result-{stem}.bin"));
            assert_eq!(
                validate(&request, profile_digest).unwrap(),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn restores_every_forbidden_syntax_category() {
        let profile = fixture("mjs-source-validator/artifact-profile.bin");
        let digest = artifact_profile_identity_digest(&profile);
        for (path, index) in [
            ("request-hold-static-import.bin", 0),
            ("request-hold-export-from.bin", 1),
            ("request-hold-division-regexp-counterexample.bin", 2),
            ("request-hold-import-meta.bin", 3),
            ("request-hold-commonjs-require.bin", 4),
        ] {
            let result =
                validate(&fixture(&format!("mjs-source-validator/{path}")), digest).unwrap();
            assert_eq!(read_u32(&result, 118 + index * 4), 1, "{path}");
            assert_eq!(result[115], 2, "{path}");
        }
    }

    #[test]
    fn diagnostics_never_use_a_recovered_ast() {
        let profile = fixture("mjs-source-validator/artifact-profile.bin");
        let digest = artifact_profile_identity_digest(&profile);
        for (source, parse, class) in [
            (b"const x = '".as_slice(), 2, 4),
            (b"let x; let x;".as_slice(), 3, 5),
        ] {
            let request = request_for_test(source);
            let result = validate(&request, digest).unwrap();
            assert_eq!((result[114], result[115], result[116]), (parse, 3, class));
            assert_eq!(&result[118..138], &[0; 20]);
        }
    }

    #[test]
    fn malformed_or_mutated_requests_produce_no_result() {
        let profile = fixture("mjs-source-validator/artifact-profile.bin");
        let digest = artifact_profile_identity_digest(&profile);
        for path in [
            "reject-request-truncated.bin",
            "reject-request-trailing.bin",
            "reject-request-digest.bin",
            "request-cap-plus-one.bin",
            "request-invalid-utf8.bin",
            "request-leading-bom.bin",
        ] {
            assert!(validate(&fixture(&format!("mjs-source-validator/{path}")), digest).is_err());
        }
    }

    fn request_for_test(source: &[u8]) -> Vec<u8> {
        let mut frame = vec![0; REQUEST_HEADER_BYTES + source.len()];
        let body_length = (frame.len() - 4) as u32;
        put_u32(&mut frame, 0, body_length);
        frame[4..12].copy_from_slice(REQUEST_MAGIC);
        for (index, value) in [
            PROTOCOL_VERSION,
            REQUEST_KIND,
            METHOD,
            VALIDATOR_PROFILE,
            SOURCE_PROFILE,
            SOURCE_MEDIA,
            CORRELATION_DOMAIN,
            SOURCE_DIGEST_DOMAIN,
        ]
        .iter()
        .enumerate()
        {
            put_u16(&mut frame, 12 + index * 2, *value);
        }
        frame[28..44].copy_from_slice(&[1; 16]);
        put_u32(&mut frame, 44, source.len() as u32);
        frame[48..80].copy_from_slice(&sha256(source));
        frame[80..].copy_from_slice(source);
        frame
    }
}
