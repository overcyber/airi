#!/bin/sh
# Finishes the Nginx configuration of airi-web before Nginx starts.
#
# 1. host.docker.internal: the Docker DNS does not know this name, which Compose writes only in
#    /etc/hosts (extra_hosts). The configuration resolves names at request time through that DNS,
#    so this script writes the IP of /etc/hosts in place of the name.
# 2. API keys: NVIDIA_API_KEY and NEOALICE_API_KEY go into the proxy configuration, so the
#    browser never holds them.
# 3. /airi-defaults.json: the first settings of AIRI, from the AIRI_DEFAULT_* variables.
#    AIRI uses them only where the browser has no setting of its own.
# 4. HTTPS: deploy/alice/scripts/preparar.sh creates the certificate on the host, in deploy/alice/tls,
#    and Compose mounts it at /etc/airi/tls. Without it, the server starts on HTTP only.
#    Then only http://localhost opens the full app: other addresses are not a secure context.
set -eu

conf=/etc/nginx/conf.d/default.conf

gateway=$(awk '$2 == "host.docker.internal" { print $1; exit }' /etc/hosts)
if [ -n "$gateway" ]; then
  sed -i "s/host\.docker\.internal/$gateway/g" "$conf"
  echo "airi-setup: host.docker.internal is $gateway"
fi

# Writes a proxy header in place of a marker line. A key with other characters is refused,
# because it would break the configuration.
put_key() {
  marker="$1"
  header="$2"
  prefix="$3"
  key="$4"
  name="$5"
  if [ -z "$key" ]; then
    return 0
  fi
  case "$key" in
    *[!A-Za-z0-9._~+/=-]*)
      echo "airi-setup: WARNING $name has characters that are not permitted. The proxy does not send it."
      return 0
      ;;
  esac
  sed -i "s|# $marker:.*|proxy_set_header $header \"$prefix$key\";|" "$conf"
  echo "airi-setup: the proxy sends $name"
}
put_key AIRI_NVIDIA_AUTH Authorization "Bearer " "${NVIDIA_API_KEY:-}" NVIDIA_API_KEY
put_key AIRI_NEOALICE_AUTH X-API-Key "" "${NEOALICE_API_KEY:-}" NEOALICE_API_KEY

# CORS: the origins of AIRI_CORS_ORIGINS (comma separated) can call the proxies from another origin.
# The default "null" is the desktop app (file://). The headers of the upstream are replaced.
cors_map=/etc/nginx/airi-cors-origins.map
# The desktop and mobile apps are always permitted: Electron sends "null" or "file://" for its pages,
# and the Capacitor app sends "https://localhost" (Android) or "capacitor://localhost" (iOS).
printf '  "null" "null";\n  "file://" "file://";\n  "https://localhost" "https://localhost";\n  "capacitor://localhost" "capacitor://localhost";\n' > "$cors_map"
for origin in $(printf '%s' "${AIRI_CORS_ORIGINS-null,file://}" | tr ',' ' '); do
  case "$origin" in
    *[!A-Za-z0-9.:/_-]*)
      echo "airi-setup: WARNING the CORS origin $origin has characters that are not permitted. It is left out."
      continue
      ;;
  esac
  case "$origin" in null|file://|https://localhost|capacitor://localhost) continue ;; esac
  printf '  "%s" "%s";\n' "$origin" "$origin" >> "$cors_map"
done
cat > /etc/nginx/airi-cors.inc <<'CORS'
proxy_hide_header Access-Control-Allow-Origin;
proxy_hide_header Access-Control-Allow-Headers;
proxy_hide_header Access-Control-Allow-Methods;
add_header Access-Control-Allow-Origin $airi_cors_origin always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-API-Key" always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
add_header Vary Origin always;
if ($request_method = OPTIONS) {
  return 204;
}
CORS
echo "airi-setup: CORS for the origins: ${AIRI_CORS_ORIGINS-null,file://}"

# JSON string: escapes the backslash and the double quote.
json() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

nvidia_key=""
if [ -n "${NVIDIA_API_KEY:-}" ]; then
  # The proxy replaces this value with the real key.
  nvidia_key="set-on-server"
fi
bool() {
  if [ "$1" = "true" ]; then echo true; else echo false; fi
}

mkdir -p /etc/airi-runtime
cat > /etc/airi-runtime/airi-defaults.json <<JSON
{
  "providers": {
    "ollama": { "baseUrl": "/proxy/llm/v1/" },
    "openai-compatible-audio-speech": { "apiKey": "local", "baseUrl": "/proxy/tts/v1/", "model": $(json "${AIRI_DEFAULT_TTS_MODEL:-kokoro}"), "voice": $(json "${AIRI_DEFAULT_TTS_VOICE:-}") },
    "openai-compatible-audio-transcription": { "apiKey": "local", "baseUrl": "/proxy/stt/v1/", "model": $(json "${AIRI_DEFAULT_STT_MODEL:-whisper-1}") },
    "nvidia": { "apiKey": $(json "$nvidia_key"), "baseUrl": "/proxy/nvidia/v1/" }
  },
  "modules": {
    "consciousness": { "provider": $(json "${AIRI_DEFAULT_CHAT_PROVIDER:-ollama}"), "model": $(json "${AIRI_DEFAULT_CHAT_MODEL:-}") },
    "speech": { "provider": "openai-compatible-audio-speech", "model": $(json "${AIRI_DEFAULT_TTS_MODEL:-kokoro}"), "voice": $(json "${AIRI_DEFAULT_TTS_VOICE:-}") },
    "hearing": { "provider": "openai-compatible-audio-transcription", "model": $(json "${AIRI_DEFAULT_STT_MODEL:-whisper-1}") }
  },
  "neoalice": {
    "site": $(json "${AIRI_DEFAULT_NEOALICE_SITE:-}"),
    "enabled": $(bool "${AIRI_DEFAULT_NEOALICE_ENABLED:-false}"),
    "speechMode": $(json "${AIRI_DEFAULT_NEOALICE_SPEECH_MODE:-silent}"),
    "voiceInput": $(bool "${AIRI_DEFAULT_NEOALICE_VOICE_INPUT:-false}"),
    "userId": $(json "${AIRI_DEFAULT_NEOALICE_USER_ID:-}"),
    "announceState": $(bool "${AIRI_DEFAULT_NEOALICE_ANNOUNCE_STATE:-false}"),
    "brainMode": $(bool "${AIRI_DEFAULT_NEOALICE_BRAIN:-false}"),
    "moodSite": $(json "${AIRI_DEFAULT_NEOALICE_MOOD_SITE:-magicmirror}")
  }
}
JSON
echo "airi-setup: wrote /airi-defaults.json"

if [ -f /etc/airi/tls/server.crt ] && [ -f /etc/airi/tls/server.key ]; then
  echo "airi-setup: HTTPS on port 443 for $(cat /etc/airi/tls/server.names 2>/dev/null || echo 'the mounted certificate')"
  exit 0
fi

echo "airi-setup: WARNING no certificate in /etc/airi/tls. HTTPS is off. Run deploy/alice/scripts/preparar.sh on the host."
sed -i -e '/listen 443 ssl;/d' -e '/http2 on;/d' -e '/ssl_certificate/d' -e '/ssl_protocols/d' "$conf"
