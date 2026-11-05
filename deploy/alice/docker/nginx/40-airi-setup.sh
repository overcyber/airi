#!/bin/sh
# Finishes the Nginx configuration of airi-web before Nginx starts.
#
# 1. host.docker.internal: the Docker DNS does not know this name, which Compose writes only in
#    /etc/hosts (extra_hosts). The configuration resolves names at request time through that DNS,
#    so this script writes the IP of /etc/hosts in place of the name.
# 2. HTTPS: deploy/alice/scripts/preparar.sh creates the certificate on the host, in deploy/alice/tls,
#    and Compose mounts it at /etc/airi/tls. Without it, the server starts on HTTP only.
#    Then only http://localhost opens the full app: other addresses are not a secure context.
set -eu

conf=/etc/nginx/conf.d/default.conf

gateway=$(awk '$2 == "host.docker.internal" { print $1; exit }' /etc/hosts)
if [ -n "$gateway" ]; then
  sed -i "s/host\.docker\.internal/$gateway/g" "$conf"
  echo "airi-setup: host.docker.internal is $gateway"
fi

if [ -f /etc/airi/tls/server.crt ] && [ -f /etc/airi/tls/server.key ]; then
  echo "airi-setup: HTTPS on port 443 for $(cat /etc/airi/tls/server.names 2>/dev/null || echo 'the mounted certificate')"
  exit 0
fi

echo "airi-setup: WARNING no certificate in /etc/airi/tls. HTTPS is off. Run deploy/alice/scripts/preparar.sh on the host."
sed -i -e '/listen 443 ssl;/d' -e '/http2 on;/d' -e '/ssl_certificate/d' -e '/ssl_protocols/d' "$conf"
