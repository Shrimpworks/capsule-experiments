use std::{
    env,
    io::{self, Read, Write},
    process::ExitCode,
};

use capsule_mjs_source_validator::{REQUEST_MAXIMUM_BYTES, parse_hex_digest, validate};

fn main() -> ExitCode {
    let mut args = env::args_os();
    let _program = args.next();
    let Some(argument) = args.next().and_then(|value| value.into_string().ok()) else {
        return ExitCode::from(64);
    };
    if args.next().is_some() {
        return ExitCode::from(64);
    }
    let Some(value) = argument.strip_prefix("--artifact-profile-digest=") else {
        return ExitCode::from(64);
    };
    let Ok(artifact_profile_digest) = parse_hex_digest(value) else {
        return ExitCode::from(65);
    };

    let mut request = Vec::with_capacity(REQUEST_MAXIMUM_BYTES.min(16 * 1024));
    let Ok(_) = io::stdin()
        .take((REQUEST_MAXIMUM_BYTES + 1) as u64)
        .read_to_end(&mut request)
    else {
        return ExitCode::from(74);
    };
    let Ok(result) = validate(&request, artifact_profile_digest) else {
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
