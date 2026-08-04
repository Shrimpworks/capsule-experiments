FROM docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04

COPY hostile-probe.ts /opt/capsule-gate-c/hostile-probe.ts

ENTRYPOINT ["/usr/local/bin/bun", "/opt/capsule-gate-c/hostile-probe.ts"]
CMD ["baseline"]
