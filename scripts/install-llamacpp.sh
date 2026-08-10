#!/usr/bin/env bash
# install-llamacpp.sh
# Install llama.cpp (llama-server) for YuiHime's local [local] provider.
# Target: ARM64 (aarch64) Ubuntu/Debian userland on Android (UserLAnd/other proot).
# Downloads the official prebuilt release binary, or builds from source with --build.
#
# Usage:
#   bash scripts/install-llamacpp.sh                 # CPU build (default)
#   bash scripts/install-llamacpp.sh --vulkan        # Vulkan build (Adreno GPU)
#   bash scripts/install-llamacpp.sh --build         # compile from source via cmake
#   bash scripts/install-llamacpp.sh --version b10333# pin a specific release tag
#
# Env: YUIHIME_SYSTEM_ROOT (default $HOME/.yuihime)

set -euo pipefail

YUIHIME_SYSTEM_ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
LLAMA_DIR="$YUIHIME_SYSTEM_ROOT/bin/llama.cpp"
VERSION="${LLAMACPP_VERSION:-latest}"
BUILD_MODE="cpu"

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vulkan) BUILD_MODE="vulkan" ;;
    --build)  BUILD_MODE="source" ;;
    --version) VERSION="$2"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
  shift
done

echo "==> llama.cpp installer"
echo "    System root : $YUIHIME_SYSTEM_ROOT"
echo "    Install dir : $LLAMA_DIR"
echo "    Build mode  : $BUILD_MODE"
echo "    Release     : ${VERSION}"

if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  echo "WARN: arch is $(uname -m); this script targets ARM64. Prebuilt assets below may not match." >&2
fi

mkdir -p "$LLAMA_DIR"

if [[ "$BUILD_MODE" == "source" ]]; then
  echo "==> Building from source (needs cmake, build-essential, git)"
  command -v cmake >/dev/null 2>&1 || sudo apt-get update && sudo apt-get install -y cmake build-essential git
  rm -rf "$LLAMA_DIR/src"
  git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$LLAMA_DIR/src"
  cmake -S "$LLAMA_DIR/src" -B "$LLAMA_DIR/build" -DLLAMA_CURL=ON -DBUILD_SHARED_LIBS=OFF -DCMAKE_BUILD_TYPE=Release
  cmake --build "$LLAMA_DIR/build" --config Release -j"$(nproc)"
  for bin in llama-server llama-cli llama-quantize; do
    ln -sf "$LLAMA_DIR/build/bin/$bin" "$YUIHIME_SYSTEM_ROOT/bin/$bin"
  done
else
  if [[ "$VERSION" == "latest" ]]; then
    RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/ggml-org/llama.cpp/releases/latest)"
  else
    RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/$VERSION)"
  fi
  TAG="$(printf '%s' "$RELEASE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
  if [[ "$BUILD_MODE" == "vulkan" ]]; then
    ASSET="llama-${TAG}-bin-ubuntu-vulkan-arm64.tar.gz"
  else
    ASSET="llama-${TAG}-bin-ubuntu-arm64.tar.gz"
  fi
  URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ASSET}"
  echo "==> Downloading $ASSET"
  curl -fSL -o "$LLAMA_DIR/$ASSET" "$URL"
  tar -xzf "$LLAMA_DIR/$ASSET" -C "$LLAMA_DIR"
  rm -f "$LLAMA_DIR/$ASSET"
  for bin in llama-server llama-cli llama-quantize; do
    found="$(find "$LLAMA_DIR" -type f -name "$bin" | head -1)"
    if [[ -n "$found" ]]; then
      chmod +x "$found"
      ln -sf "$found" "$YUIHIME_SYSTEM_ROOT/bin/$bin"
    fi
  done
fi

echo
echo "==> Done. Binaries linked into $YUIHIME_SYSTEM_ROOT/bin"
ls -la "$YUIHIME_SYSTEM_ROOT/bin/llama-server" 2>/dev/null || echo "llama-server not found; inspect $LLAMA_DIR"
echo
echo "Next: download a local model, then point Yui's [local] provider at llama-server:"
echo "  llama-server -m <model.gguf> --host 127.0.0.1 --port 8080 --ctx-size 8192"
echo "  config.toml: [local] baseUrl = \"http://localhost:8080/v1\""
