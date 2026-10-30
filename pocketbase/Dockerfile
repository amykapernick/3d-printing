# Pinned PocketBase so the committed JS migrations always match the runtime.
FROM alpine:3.20 AS build
ARG PB_VERSION=0.40.5
RUN apk add --no-cache ca-certificates unzip wget
WORKDIR /pb
# Detect the arch from the build container itself (works for a native build on
# any host AND a `buildx --platform` cross-build, which runs RUN steps emulated
# as the target arch). Do NOT key this off the TARGETARCH build arg: it's only
# auto-set by BuildKit, so a plain `docker build` leaves it empty and silently
# downloads the wrong binary — which is exactly how an amd64 PB landed on a Pi.
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
      x86_64)  PB_ARCH=amd64 ;; \
      aarch64) PB_ARCH=arm64 ;; \
      armv7l)  PB_ARCH=armv7 ;; \
      *)       echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac && \
    wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O pb.zip && \
    unzip pb.zip && rm pb.zip

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /pb
COPY --from=build /pb/pocketbase /pb/pocketbase
COPY entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh
EXPOSE 8090
ENTRYPOINT ["/pb/entrypoint.sh"]
