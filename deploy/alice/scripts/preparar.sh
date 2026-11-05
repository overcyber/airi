#!/usr/bin/env bash
# Prepares the Alice deployment on this machine. Safe to run again.
#
# 1. Creates deploy/alice/.env from .env.example, with the IPs and the name of this machine.
# 2. Creates the HTTPS certificates in deploy/alice/tls: a local certificate authority (CA)
#    and a server certificate for localhost, 127.0.0.1, and every name in AIRI_TLS_NAMES.
# 3. Lists the models in deploy/alice/modelos.
#
# Why HTTPS: the browser gives some APIs only to a secure context, that is HTTPS or
# http://localhost. AIRI needs them. On any other address, open https://<ip>:4443.
# Install tls/ca.crt once on each client device, and the browser trusts the address.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$here/.env"
tls_dir="$here/tls"

if ! command -v openssl >/dev/null 2>&1; then
  echo "preparar: openssl is missing. Install it, for example: sudo apt-get install -y openssl" >&2
  exit 1
fi

# The IPv4 addresses and the name of this machine.
detect_names() {
  local names
  names="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^172\.1[7-9]\.\|^172\.2[0-9]\.\|^172\.3[01]\.' || true)"
  names="$names"$'\n'"$(hostname 2>/dev/null || true)"
  echo "$names" | sed '/^$/d' | sort -u | paste -sd, -
}

if [ ! -f "$env_file" ]; then
  cp "$here/.env.example" "$env_file"
  names="$(detect_names)"
  sed -i "s/^AIRI_TLS_NAMES=.*/AIRI_TLS_NAMES=$names/" "$env_file"
  echo "preparar: created $env_file with AIRI_TLS_NAMES=$names"
else
  echo "preparar: kept $env_file"
fi

names="localhost,127.0.0.1,$(grep -E '^AIRI_TLS_NAMES=' "$env_file" | cut -d= -f2- | tr -d ' ')"
san=""
for name in $(echo "$names" | tr ',' ' '); do
  [ -z "$name" ] && continue
  if [[ "$name" =~ ^[0-9.]+$ || "$name" == *:* ]]; then entry="IP:$name"; else entry="DNS:$name"; fi
  case ",$san," in *",$entry,"*) ;; *) san="${san:+$san,}$entry" ;; esac
done

mkdir -p "$tls_dir"
if [ ! -f "$tls_dir/ca.key" ] || [ ! -f "$tls_dir/ca.crt" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$tls_dir/ca.key" -out "$tls_dir/ca.crt" \
    -subj "/CN=AIRI Alice local CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  echo "preparar: created the local CA $tls_dir/ca.crt"
fi

if [ ! -f "$tls_dir/server.crt" ] || [ "$(cat "$tls_dir/server.names" 2>/dev/null)" != "$san" ]; then
  openssl req -newkey rsa:2048 -nodes -keyout "$tls_dir/server.key" -out "$tls_dir/server.csr" -subj "/CN=airi-web" 2>/dev/null
  printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$san" > "$tls_dir/server.ext"
  openssl x509 -req -in "$tls_dir/server.csr" -CA "$tls_dir/ca.crt" -CAkey "$tls_dir/ca.key" -CAcreateserial \
    -days 825 -out "$tls_dir/server.crt" -extfile "$tls_dir/server.ext" 2>/dev/null
  echo "$san" > "$tls_dir/server.names"
  rm -f "$tls_dir/server.csr" "$tls_dir/server.ext"
  echo "preparar: signed the server certificate for $san"
else
  echo "preparar: kept the server certificate for $san"
fi
chmod 600 "$tls_dir/ca.key"
# Nginx in the container reads the server key.
chmod 644 "$tls_dir/server.key" "$tls_dir/server.crt" "$tls_dir/ca.crt"

# The Eva in VRM. When modelos/ has no VRM, the script takes eva2.glb and converts it.
# Sources, in order: EVA_GLB (a path), then ../talkinghead-neoalice/avatars/eva2.glb next to
# this repository. No server is needed: only the file.
mkdir -p "$here/modelos"
if ! find "$here/modelos" -maxdepth 1 -iname '*.vrm' | grep -q .; then
  repo_root="$(cd "$here/../.." && pwd)"
  source_dir="$here/modelos/.fonte"
  mkdir -p "$source_dir"
  glb=""
  for candidate in "${EVA_GLB:-}" "$repo_root/../talkinghead-neoalice/avatars/eva2.glb"; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      cp "$candidate" "$source_dir/eva2.glb"
      glb="$candidate"
      break
    fi
  done
  if [ -z "$glb" ]; then
    rm -rf "$source_dir"
    echo "preparar: ERROR eva2.glb not found. Run again with EVA_GLB=/path/to/eva2.glb, or clone talkinghead-neoalice next to airi." >&2
    exit 1
  fi
  echo "preparar: converting $glb to modelos/eva2.vrm (the first run builds the tools image)"
  if ! docker image inspect alice/airi-tools:local >/dev/null 2>&1; then
    docker compose -f "$here/compose.yaml" --profile tools build eva-convert
  fi
  # Runs as the user of this script, so the new file belongs to that user.
  docker compose -f "$here/compose.yaml" --profile tools run --rm --user "$(id -u):$(id -g)" eva-convert \
    /modelos/.fonte/eva2.glb /modelos/eva2.vrm Eva Alice
  rm -rf "$source_dir"
fi

# Nginx in the container runs as another user. A model readable only by its owner answers 403.
chmod a+rx "$here/modelos"
find "$here/modelos" -maxdepth 1 -iname '*.vrm' -exec chmod a+r {} +

models="$(find "$here/modelos" -maxdepth 1 -iname '*.vrm' -printf '%f ' 2>/dev/null || true)"
if [ -n "$models" ]; then
  echo "preparar: models: $models"
else
  echo "preparar: no .vrm in $here/modelos. Put eva2.vrm there (see modelos/README.md)."
fi

echo
echo "Next: docker compose -f deploy/alice/compose.yaml up -d --build"
echo "Open: http://localhost:4173 on this machine, or https://<ip>:4443 on any other device."
