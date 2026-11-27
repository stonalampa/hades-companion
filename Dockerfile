# Server edition: web app + Go server (state, Steam sync, MCP) in one small image.
# Game text/icons are NOT in the image (Supergiant's assets): mount them at /data/assets.

# --- web
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src
COPY data/ data/
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
RUN cd web && npm run build

# --- server (cross-compiled on the build platform, no cgo)
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS server
ARG TARGETOS TARGETARCH
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH GOWORK=off \
    go build -trimpath -ldflags="-s -w" -o /out/server . && mkdir -p /out/state

# --- runtime
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=server /out/server /app/server
COPY --from=web /src/web/dist /app/web
COPY data/hades1/dataset.json /app/data/hades1/dataset.json
# Pre-create the state dir owned by nonroot, so a named volume starts writable.
COPY --from=server --chown=65532:65532 /out/state /data/state

# /data/assets: text.en.json, icons/, achievements.en.json, achievement-icons/ (optional, read-only)
# /data/state:  state.json (run + achievements), must be writable by uid 65532
VOLUME ["/data/state"]
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/server", "-addr", ":8080", "-web", "/app/web", \
            "-data", "/app/data/hades1/dataset.json", \
            "-assets", "/data/assets", "-state", "/data/state/state.json"]
