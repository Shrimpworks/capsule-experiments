FROM docker.io/nixos/nix@sha256:377d4887aca98f0dfa12971c1ea6d6a625a435d8b610d4c95a436843da6fbfd1

# DEVELOPMENT-ONLY Gate C P0-0 builder. The Bun checkout's own flake.lock
# selects the build tools; this image only pins the Nix bootstrap environment.
WORKDIR /work
ENTRYPOINT ["/bin/sh", "-lc"]
