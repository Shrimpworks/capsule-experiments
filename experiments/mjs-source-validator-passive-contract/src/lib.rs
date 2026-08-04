//! Test-only independent Rust oracle for the passive Source Validator contract.
//! No function launches a process, invokes a parser, or mutates external state.

use sha2::{Digest, Sha256};

pub const REQUEST_HEADER_BYTES: usize = 80;
pub const SOURCE_MAXIMUM_BYTES: usize = 262_144;
pub const REQUEST_MAXIMUM_BYTES: usize = REQUEST_HEADER_BYTES + SOURCE_MAXIMUM_BYTES;
pub const RESULT_FRAME_BYTES: usize = 138;
pub const CANDIDATE_FRAME_BYTES: usize = 292;
pub const ARTIFACT_PROFILE_FRAME_BYTES: usize = 160;

const PROTOCOL_VERSION: u16 = 0;
const REQUEST_KIND: u16 = 1;
const RESULT_KIND: u16 = 2;
const METHOD: u16 = 1;
const VALIDATOR_PROFILE: u16 = 1;
const SOURCE_PROFILE: u16 = 1;
const SOURCE_MEDIA: u16 = 1;
const CORRELATION_DOMAIN: u16 = 1;
const SOURCE_DIGEST_DOMAIN: u16 = 0x0101;
const CANDIDATE_DIGEST_DOMAIN: u16 = 0x0102;
const EXECUTABLE_DIGEST_DOMAIN: u16 = 0x0103;
const BUILD_DIGEST_DOMAIN: u16 = 0x0104;
const ASSESSMENT_DIGEST_DOMAIN: u16 = 0x0105;
const ARTIFACT_PROFILE_DOMAIN: u16 = 0x0106;

const REQUEST_MAGIC: &[u8; 8] = b"CAPMJSRQ";
const RESULT_MAGIC: &[u8; 8] = b"CAPMJSRS";
const CANDIDATE_MAGIC: &[u8; 8] = b"CAPMJSCI";
const PROFILE_MAGIC: &[u8; 8] = b"CAPMJSAP";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Classification {
    Malformed,
    Unsupported,
    Schema,
    Domain,
    Binding,
}

impl Classification {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Malformed => "MALFORMED",
            Self::Unsupported => "UNSUPPORTED",
            Self::Schema => "SCHEMA",
            Self::Domain => "DOMAIN",
            Self::Binding => "BINDING",
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct ContractError {
    pub classification: Classification,
    pub code: &'static str,
}

type ContractResult<T> = Result<T, ContractError>;

fn reject<T>(classification: Classification, code: &'static str) -> ContractResult<T> {
    Err(ContractError {
        classification,
        code,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub correlation_id: [u8; 16],
    pub source_digest: [u8; 32],
    pub source: Vec<u8>,
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactProfile {
    pub candidate_digest: [u8; 32],
    pub executable_digest: [u8; 32],
    pub build_digest: [u8; 32],
    pub assessment_digest: [u8; 32],
}

pub fn encode_request(correlation_id: [u8; 16], source: &[u8]) -> ContractResult<Vec<u8>> {
    validate_source(source)?;
    if correlation_id == [0; 16] {
        return reject(Classification::Schema, "zero-correlation-id");
    }
    let mut frame = vec![0; REQUEST_HEADER_BYTES + source.len()];
    let body_length = (frame.len() - 4) as u32;
    put_u32(&mut frame, 0, body_length);
    frame[4..12].copy_from_slice(REQUEST_MAGIC);
    write_common(&mut frame, REQUEST_KIND, correlation_id, source);
    frame[REQUEST_HEADER_BYTES..].copy_from_slice(source);
    Ok(frame)
}

pub fn decode_request(frame: &[u8]) -> ContractResult<Request> {
    validate_frame(
        frame,
        REQUEST_MAGIC,
        REQUEST_HEADER_BYTES,
        REQUEST_MAXIMUM_BYTES,
    )?;
    validate_common(frame, REQUEST_KIND)?;
    let source_length = read_u32(frame, 44) as usize;
    if source_length > SOURCE_MAXIMUM_BYTES {
        return reject(Classification::Domain, "source-cap");
    }
    if source_length != frame.len() - REQUEST_HEADER_BYTES {
        return reject(Classification::Binding, "source-length");
    }
    let correlation_id = array::<16>(&frame[28..44]);
    if correlation_id == [0; 16] {
        return reject(Classification::Schema, "zero-correlation-id");
    }
    let source = frame[REQUEST_HEADER_BYTES..].to_vec();
    validate_source(&source)?;
    let source_digest = sha256(&source);
    if source_digest != frame[48..80] {
        return reject(Classification::Binding, "source-digest");
    }
    Ok(Request {
        correlation_id,
        source_digest,
        source,
    })
}

pub fn encode_result(result: &ResultFrame) -> ContractResult<Vec<u8>> {
    validate_result(result)?;
    let mut frame = vec![0; RESULT_FRAME_BYTES];
    put_u32(&mut frame, 0, (RESULT_FRAME_BYTES - 4) as u32);
    frame[4..12].copy_from_slice(RESULT_MAGIC);
    write_common_values(
        &mut frame,
        RESULT_KIND,
        result.correlation_id,
        result.source_length,
        result.source_digest,
    );
    put_u16(&mut frame, 80, ARTIFACT_PROFILE_DOMAIN);
    frame[82..114].copy_from_slice(&result.artifact_profile_digest);
    frame[114] = result.parse;
    frame[115] = result.policy;
    frame[116] = result.classification;
    for (index, count) in result.counts.iter().enumerate() {
        put_u32(&mut frame, 118 + index * 4, *count);
    }
    Ok(frame)
}

pub fn decode_result(frame: &[u8]) -> ContractResult<ResultFrame> {
    validate_frame(frame, RESULT_MAGIC, RESULT_FRAME_BYTES, RESULT_FRAME_BYTES)?;
    validate_common(frame, RESULT_KIND)?;
    if read_u16(frame, 80) != ARTIFACT_PROFILE_DOMAIN {
        return reject(Classification::Domain, "artifact-profile-digest-domain");
    }
    if frame[117] != 0 {
        return reject(Classification::Unsupported, "result-reserved-byte");
    }
    let result = ResultFrame {
        correlation_id: array::<16>(&frame[28..44]),
        source_length: read_u32(frame, 44),
        source_digest: array::<32>(&frame[48..80]),
        artifact_profile_digest: array::<32>(&frame[82..114]),
        parse: frame[114],
        policy: frame[115],
        classification: frame[116],
        counts: [
            read_u32(frame, 118),
            read_u32(frame, 122),
            read_u32(frame, 126),
            read_u32(frame, 130),
            read_u32(frame, 134),
        ],
    };
    validate_result(&result)?;
    Ok(result)
}

pub fn verify_result(
    request: &Request,
    artifact_profile_bytes: &[u8],
    result_bytes: &[u8],
) -> ContractResult<ResultFrame> {
    let _profile = decode_artifact_profile(artifact_profile_bytes)?;
    let result = decode_result(result_bytes)?;
    if result.artifact_profile_digest != artifact_profile_identity_digest(artifact_profile_bytes)
        || result.correlation_id != request.correlation_id
        || result.source_length as usize != request.source.len()
        || result.source_digest != request.source_digest
    {
        return reject(Classification::Binding, "request-result-or-artifact");
    }
    Ok(result)
}

pub fn encode_candidate() -> Vec<u8> {
    let mut frame = vec![0; CANDIDATE_FRAME_BYTES];
    put_u32(&mut frame, 0, (CANDIDATE_FRAME_BYTES - 4) as u32);
    frame[4..12].copy_from_slice(CANDIDATE_MAGIC);
    for (index, value) in [0, 1, 0, 140, 0, 1, 95, 0, 0x000f, 6, 65, 0]
        .iter()
        .enumerate()
    {
        put_u16(&mut frame, 12 + index * 2, *value);
    }
    put_u32(&mut frame, 36, 24_449_903);
    put_u32(&mut frame, 40, 1_854_528);
    frame[44..76].copy_from_slice(&hex32(
        "505669a07338603876bc96c242f8d5af386d3a13139e70110a8b52f39bae69ac",
    ));
    let crates = [
        "0f8245ba555b465d3577732d5f9d9306babb0aaa7b80e97a2ce21f74fae442a3",
        "3305400b90fff2a30b272b58fe6080d25369407b2ac37c4ac652996a9677efe0",
        "4640e6d0de2e0f6c820d1444a468d070c710111df76ce90a1694ac386641e133",
        "8abd68f81349d37ea79f1d99d2370e15f282cc9fbe66e8544d072595744ab38e",
        "5967f96881e1694d10b453311fa681b4df0f38760628e1de613b046566cd8c8e",
        "e83fa0a0fe6e5e2f5abb173a64afe8db711bb612acbc002c663fd13b08a8cbf3",
    ];
    for (index, checksum) in crates.iter().enumerate() {
        let offset = 76 + index * 36;
        put_u16(&mut frame, offset, (index + 1) as u16);
        frame[offset + 4..offset + 36].copy_from_slice(&hex32(checksum));
    }
    frame
}

pub fn decode_candidate(frame: &[u8]) -> ContractResult<()> {
    validate_frame(
        frame,
        CANDIDATE_MAGIC,
        CANDIDATE_FRAME_BYTES,
        CANDIDATE_FRAME_BYTES,
    )?;
    if frame != encode_candidate() {
        return reject(
            Classification::Unsupported,
            "engineering-candidate-identity",
        );
    }
    Ok(())
}

pub fn engineering_candidate_identity_digest(candidate_bytes: &[u8]) -> [u8; 32] {
    domain_hash(
        "capsule.source-validator.engineering-candidate/v0",
        candidate_bytes,
    )
}

pub fn encode_artifact_profile(
    executable_digest: [u8; 32],
    build_digest: [u8; 32],
    assessment_digest: [u8; 32],
) -> ContractResult<Vec<u8>> {
    if executable_digest == [0; 32] || build_digest == [0; 32] || assessment_digest == [0; 32] {
        return reject(Classification::Schema, "zero-artifact-profile-digest");
    }
    let mut frame = vec![0; ARTIFACT_PROFILE_FRAME_BYTES];
    put_u32(&mut frame, 0, (ARTIFACT_PROFILE_FRAME_BYTES - 4) as u32);
    frame[4..12].copy_from_slice(PROFILE_MAGIC);
    for (index, value) in [
        0,
        PROTOCOL_VERSION,
        METHOD,
        VALIDATOR_PROFILE,
        SOURCE_PROFILE,
        SOURCE_MEDIA,
    ]
    .iter()
    .enumerate()
    {
        put_u16(&mut frame, 12 + index * 2, *value);
    }
    put_u16(&mut frame, 24, CANDIDATE_DIGEST_DOMAIN);
    frame[26..58].copy_from_slice(&engineering_candidate_identity_digest(&encode_candidate()));
    put_u16(&mut frame, 58, EXECUTABLE_DIGEST_DOMAIN);
    frame[60..92].copy_from_slice(&executable_digest);
    put_u16(&mut frame, 92, BUILD_DIGEST_DOMAIN);
    frame[94..126].copy_from_slice(&build_digest);
    put_u16(&mut frame, 126, ASSESSMENT_DIGEST_DOMAIN);
    frame[128..160].copy_from_slice(&assessment_digest);
    Ok(frame)
}

pub fn decode_artifact_profile(frame: &[u8]) -> ContractResult<ArtifactProfile> {
    validate_frame(
        frame,
        PROFILE_MAGIC,
        ARTIFACT_PROFILE_FRAME_BYTES,
        ARTIFACT_PROFILE_FRAME_BYTES,
    )?;
    if [
        read_u16(frame, 12),
        read_u16(frame, 14),
        read_u16(frame, 16),
        read_u16(frame, 18),
        read_u16(frame, 20),
        read_u16(frame, 22),
    ] != [
        0,
        PROTOCOL_VERSION,
        METHOD,
        VALIDATOR_PROFILE,
        SOURCE_PROFILE,
        SOURCE_MEDIA,
    ] {
        return reject(
            Classification::Unsupported,
            "artifact-profile-version-or-profile",
        );
    }
    if read_u16(frame, 24) != CANDIDATE_DIGEST_DOMAIN
        || read_u16(frame, 58) != EXECUTABLE_DIGEST_DOMAIN
        || read_u16(frame, 92) != BUILD_DIGEST_DOMAIN
        || read_u16(frame, 126) != ASSESSMENT_DIGEST_DOMAIN
    {
        return reject(Classification::Domain, "artifact-profile-digest-domain");
    }
    let profile = ArtifactProfile {
        candidate_digest: array::<32>(&frame[26..58]),
        executable_digest: array::<32>(&frame[60..92]),
        build_digest: array::<32>(&frame[94..126]),
        assessment_digest: array::<32>(&frame[128..160]),
    };
    if profile.candidate_digest != engineering_candidate_identity_digest(&encode_candidate()) {
        return reject(Classification::Binding, "engineering-candidate");
    }
    if profile.executable_digest == [0; 32]
        || profile.build_digest == [0; 32]
        || profile.assessment_digest == [0; 32]
    {
        return reject(Classification::Schema, "zero-artifact-profile-digest");
    }
    Ok(profile)
}

pub fn artifact_profile_identity_digest(profile_bytes: &[u8]) -> [u8; 32] {
    domain_hash(
        "capsule.source-validator.artifact-profile/v0",
        profile_bytes,
    )
}

fn validate_source(source: &[u8]) -> ContractResult<()> {
    if source.len() > SOURCE_MAXIMUM_BYTES {
        return reject(Classification::Domain, "source-cap");
    }
    if source.starts_with(&[0xef, 0xbb, 0xbf]) || std::str::from_utf8(source).is_err() {
        return reject(Classification::Domain, "source-profile");
    }
    Ok(())
}

fn validate_result(result: &ResultFrame) -> ContractResult<()> {
    if result.correlation_id == [0; 16]
        || result.source_length as usize > SOURCE_MAXIMUM_BYTES
        || result.artifact_profile_digest == [0; 32]
    {
        return reject(Classification::Schema, "result-identity-or-length");
    }
    if result
        .counts
        .iter()
        .any(|count| *count as usize > SOURCE_MAXIMUM_BYTES || *count > result.source_length)
    {
        return reject(Classification::Domain, "result-count");
    }
    let syntax = result.counts[..4].iter().any(|count| *count > 0);
    let commonjs = result.counts[4] > 0;
    let valid = match result.parse {
        1 => matches!(
            (result.policy, syntax, commonjs, result.classification),
            (1, false, false, 0) | (2, true, false, 1) | (2, false, true, 2) | (2, true, true, 3)
        ),
        2 => result.policy == 3 && result.classification == 4 && !syntax && !commonjs,
        3 => result.policy == 3 && result.classification == 5 && !syntax && !commonjs,
        _ => false,
    };
    if !valid {
        return reject(Classification::Domain, "result-status-classification");
    }
    Ok(())
}

fn write_common(frame: &mut [u8], kind: u16, id: [u8; 16], source: &[u8]) {
    write_common_values(frame, kind, id, source.len() as u32, sha256(source));
}

fn write_common_values(
    frame: &mut [u8],
    kind: u16,
    id: [u8; 16],
    source_length: u32,
    source_digest: [u8; 32],
) {
    for (index, value) in [
        PROTOCOL_VERSION,
        kind,
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
        put_u16(frame, 12 + index * 2, *value);
    }
    frame[28..44].copy_from_slice(&id);
    put_u32(frame, 44, source_length);
    frame[48..80].copy_from_slice(&source_digest);
}

fn validate_common(frame: &[u8], kind: u16) -> ContractResult<()> {
    let expected = [
        PROTOCOL_VERSION,
        kind,
        METHOD,
        VALIDATOR_PROFILE,
        SOURCE_PROFILE,
        SOURCE_MEDIA,
        CORRELATION_DOMAIN,
        SOURCE_DIGEST_DOMAIN,
    ];
    for (index, value) in expected.iter().enumerate() {
        if read_u16(frame, 12 + index * 2) != *value {
            return reject(
                if index >= 6 {
                    Classification::Domain
                } else {
                    Classification::Unsupported
                },
                "common-field",
            );
        }
    }
    Ok(())
}

fn validate_frame(
    frame: &[u8],
    magic: &[u8; 8],
    minimum: usize,
    maximum: usize,
) -> ContractResult<()> {
    if frame.len() < 4 {
        return reject(Classification::Malformed, "truncated-length");
    }
    let declared = read_u32(frame, 0) as usize + 4;
    if declared > maximum {
        return reject(Classification::Domain, "frame-cap");
    }
    if declared < minimum || declared != frame.len() {
        return reject(Classification::Malformed, "frame-length-or-trailing");
    }
    if frame.len() < 12 || &frame[4..12] != magic {
        return reject(Classification::Domain, "frame-domain");
    }
    Ok(())
}

fn sha256(value: &[u8]) -> [u8; 32] {
    Sha256::digest(value).into()
}

fn domain_hash(domain: &str, value: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(domain.as_bytes());
    hash.update([0]);
    hash.update(value);
    hash.finalize().into()
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
    value.try_into().expect("fixed slice length")
}

fn hex32(value: &str) -> [u8; 32] {
    let mut result = [0; 32];
    for (index, item) in result.iter_mut().enumerate() {
        *item = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).expect("fixed hex");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn verifies_complete_generated_corpus() {
        let root = corpus_root();
        let manifest: Value =
            serde_json::from_slice(&fs::read(root.join("manifest.json")).unwrap()).unwrap();
        let cases: Vec<&Value> = manifest["cases"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|case| {
                case["expected"]["owner"] == "source-validator-passive-contract"
                    && case["implementations"]["rust"] == "verified"
            })
            .collect();
        assert_eq!(cases.len(), 128);

        for case in cases {
            let fixture = read_reference(&root, &case["fixture"]);
            let outcome = match case["object"].as_str().unwrap() {
                "SourceValidatorEngineeringCandidate" => decode_candidate(&fixture),
                "SourceValidatorArtifactProfile" => decode_artifact_profile(&fixture).map(|_| ()),
                "SourceValidatorRequest" => decode_request(&fixture).map(|_| ()),
                "SourceValidatorResult" => {
                    let request =
                        decode_request(&read_reference(&root, &case["context"]["request"]))
                            .expect("context request");
                    let profile = read_reference(&root, &case["context"]["artifactProfile"]);
                    verify_result(&request, &profile, &fixture).map(|_| ())
                }
                object => panic!("unexpected object {object}"),
            };
            match case["expected"]["decision"].as_str().unwrap() {
                "accept" => assert!(outcome.is_ok(), "{}: {outcome:?}", case["id"]),
                "reject" => {
                    let error = outcome.expect_err(case["id"].as_str().unwrap());
                    assert_eq!(
                        error.classification.as_str(),
                        case["expected"]["classification"].as_str().unwrap(),
                        "{}",
                        case["id"]
                    );
                    for effect in [
                        "state",
                        "approval",
                        "key",
                        "ipcEndpoint",
                        "process",
                        "runtime",
                        "backend",
                        "guest",
                    ] {
                        assert_eq!(
                            case["expected"]["effects"][effect], false,
                            "{} {effect}",
                            case["id"]
                        );
                    }
                }
                decision => panic!("unexpected decision {decision}"),
            }
        }
    }

    #[test]
    fn independent_encoders_match_known_answers() {
        let root = corpus_root();
        assert_eq!(
            encode_candidate(),
            fs::read(root.join("mjs-source-validator/engineering-candidate.bin")).unwrap()
        );
        assert_eq!(
            encode_artifact_profile([0x11; 32], [0x22; 32], [0x33; 32]).unwrap(),
            fs::read(root.join("mjs-source-validator/artifact-profile.bin")).unwrap()
        );
        let source = fs::read(root.join("mjs-source/ordinary.mjs")).unwrap();
        let id = array::<16>(&(1u8..=16).collect::<Vec<_>>());
        let request_bytes = encode_request(id, &source).unwrap();
        assert_eq!(
            request_bytes,
            fs::read(root.join("mjs-source-validator/request-ordinary.bin")).unwrap()
        );
        let request = decode_request(&request_bytes).unwrap();
        let profile = fs::read(root.join("mjs-source-validator/artifact-profile.bin")).unwrap();
        let result = ResultFrame {
            correlation_id: id,
            source_length: source.len() as u32,
            source_digest: sha256(&source),
            artifact_profile_digest: artifact_profile_identity_digest(&profile),
            parse: 1,
            policy: 1,
            classification: 0,
            counts: [0; 5],
        };
        let result_bytes = encode_result(&result).unwrap();
        assert_eq!(
            result_bytes,
            fs::read(root.join("mjs-source-validator/result-ordinary.bin")).unwrap()
        );
        assert_eq!(
            verify_result(&request, &profile, &result_bytes).unwrap(),
            result
        );
    }

    #[test]
    fn retains_exact_maxima_and_domain_known_answers() {
        let root = corpus_root();
        let answers = [
            (
                "mjs-source-validator/engineering-candidate.bin",
                292,
                "2c39757c40198074f1b1dd6e0ed37fb6c75c1c699c0090e2aa4b8ae88cecc9af",
            ),
            (
                "mjs-source-validator/artifact-profile.bin",
                160,
                "2075ee498ce4b3d81843d57c5289f0056092aa5e3b575d885018c7348419fc8b",
            ),
            (
                "mjs-source-validator/request-minimum.bin",
                80,
                "4e40f3057a7d4fe7814b74806d794c91e30b5f79f8b55d12c0d76c0c177fc4f7",
            ),
            (
                "mjs-source-validator/request-ordinary.bin",
                137,
                "5ea0960c1b8200f483ee29fa2756b15c69a62aadcb1dc675c244569b295795fc",
            ),
            (
                "mjs-source-validator/request-exact-maximum.bin",
                REQUEST_MAXIMUM_BYTES,
                "24db6d0599ba05dead0e7eac1f1454262506c8c187b5542694bb6bb12e6a0571",
            ),
            (
                "mjs-source-validator/request-cap-plus-one.bin",
                REQUEST_MAXIMUM_BYTES + 1,
                "4add49e80567b4c097bbad0f989863fe028b868304b18d4ef40c9349a888428b",
            ),
            (
                "mjs-source-validator/result-ordinary.bin",
                RESULT_FRAME_BYTES,
                "5a428178447f70607367f0c052f674ce74315a60376cf15826de06562ea1ca25",
            ),
        ];
        for (path, length, digest) in answers {
            let value = fs::read(root.join(path)).unwrap();
            assert_eq!(value.len(), length, "{path}");
            assert_eq!(hex_string(&sha256(&value)), digest, "{path}");
        }
        let candidate =
            fs::read(root.join("mjs-source-validator/engineering-candidate.bin")).unwrap();
        assert_eq!(
            hex_string(&engineering_candidate_identity_digest(&candidate)),
            "11a08cace3ddc4dde925bd93ea3de8ea313f7f5766839deca802078df038d0c6"
        );
        let profile = fs::read(root.join("mjs-source-validator/artifact-profile.bin")).unwrap();
        assert_eq!(
            hex_string(&artifact_profile_identity_digest(&profile)),
            "0fe1523741ac3cedc32e062778836d73f4eb21f422b3587d78ad81df8c180908"
        );
    }

    fn read_reference(root: &Path, reference: &Value) -> Vec<u8> {
        fs::read(root.join(reference["path"].as_str().expect("fixture path"))).unwrap()
    }

    fn corpus_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schemas/conformance/v0")
    }

    fn hex_string(value: &[u8]) -> String {
        value.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}
