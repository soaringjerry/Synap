# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM golang:1.23-alpine AS build
WORKDIR /app

# Enable static build for scratch image
ENV CGO_ENABLED=0
ARG TARGETOS
ARG TARGETARCH

COPY go.mod ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags='-s -w' -o /out/synap ./cmd/server

# ---- Runtime stage ----
FROM scratch AS final
WORKDIR /
COPY --from=build /out/synap /synap

EXPOSE 8080
ENV SYNAP_ADDR=:8080
ARG GIT_SHA
ARG BUILD_TIME
ENV SYNAP_COMMIT=${GIT_SHA}
ENV SYNAP_BUILD_TIME=${BUILD_TIME}

ENTRYPOINT ["/synap"]
