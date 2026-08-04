FROM oven/bun@sha256:5148f6742ac31fac28e6eab391ab1f11f6dfc0c8512c7a3679b374ec470f5982

COPY probe.ts /capsule/probe.ts

USER 65532:65532
ENTRYPOINT ["/usr/local/bin/bun", "/capsule/probe.ts"]
