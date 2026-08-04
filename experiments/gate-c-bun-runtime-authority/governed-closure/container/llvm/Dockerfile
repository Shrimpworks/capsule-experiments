FROM docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04

# DEVELOPMENT-ONLY Gate C P0-0 source builder. This follows the exact retained
# Bun 1.3.14 bootstrap guidance and is not an admitted Capsule runtime image.
ARG LLVM_INSTALLER_SHA256=9474ecd78b52aba6e923976b1e9773f5613027cc7e237b9956986cb536e02a36
ARG RUSTUP_INSTALLER_SHA256=6c30b75a75b28a96fd913a037c8581b580080b6ee9b8169a3c0feb1af7fe8caf

USER root
RUN apt-get update && apt-get install --yes --no-install-recommends \
      apt-transport-https bash build-essential ca-certificates ccache cmake curl \
      git gnupg golang libtool lsb-release make ninja-build perl pkg-config \
      python3 ruby unzip wget xz-utils

RUN curl --fail --silent --show-error --location https://sh.rustup.rs \
      --output /tmp/rustup.sh && \
    echo "${RUSTUP_INSTALLER_SHA256}  /tmp/rustup.sh" | sha256sum --check --strict && \
    CARGO_HOME=/opt/rust RUSTUP_HOME=/opt/rust \
      sh /tmp/rustup.sh -y --no-modify-path --default-toolchain none --profile minimal && \
    CARGO_HOME=/opt/rust RUSTUP_HOME=/opt/rust \
      /opt/rust/bin/rustup toolchain install nightly-2025-12-10 --profile minimal \
      --component rust-src \
      --target x86_64-unknown-freebsd \
      --target aarch64-linux-android \
      --target x86_64-linux-android && \
    rm /tmp/rustup.sh

RUN if [ -x /usr/bin/sqv ] && [ -f /usr/share/apt/default-sequoia.config ]; then \
      mkdir -p /etc/crypto-policies/back-ends && \
      sed 's/sha1.second_preimage_resistance = 2026-02-01/sha1.second_preimage_resistance = 2028-02-01/' \
        /usr/share/apt/default-sequoia.config \
        > /etc/crypto-policies/back-ends/apt-sequoia.config; \
    fi && \
    curl --fail --silent --show-error --location https://apt.llvm.org/llvm.sh \
      --output /tmp/llvm.sh && \
    echo "${LLVM_INSTALLER_SHA256}  /tmp/llvm.sh" | sha256sum --check --strict && \
    bash /tmp/llvm.sh 21 all && \
    apt-get install --yes --no-install-recommends llvm-21-tools && \
    clang-21 --version | head -n 1 | grep '21.1.8' && \
    llvm-config-21 --version | grep '^21.1.8$' && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/llvm.sh

ENV CC=/usr/bin/clang-21 \
    CXX=/usr/bin/clang++-21 \
    AR=/usr/bin/llvm-ar-21 \
    RANLIB=/usr/bin/llvm-ranlib-21 \
    LD=/usr/bin/ld.lld-21 \
    CARGO_HOME=/opt/rust \
    RUSTUP_HOME=/opt/rust \
    PATH=/opt/rust/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /work
ENTRYPOINT ["/bin/bash", "-c"]
