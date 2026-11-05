#!/bin/sh
# Starts a local Mosquitto that copies the NeoAlice topics from the NeoAlice broker, read only.
#
# Why: the browser speaks MQTT only over WebSocket. A NeoAlice broker without a websockets
# listener cannot serve AIRI. This bridge gives that listener, and the NeoAlice broker and its
# configuration do not change. The bridge only subscribes ("in"): it never publishes to NeoAlice.
#
# Environment:
#   NEOALICE_MQTT_HOST      host or IP of the NeoAlice broker (required)
#   NEOALICE_MQTT_PORT      MQTT port of that broker (default 1883)
#   NEOALICE_MQTT_USERNAME  optional
#   NEOALICE_MQTT_PASSWORD  optional
#   NEOALICE_MQTT_TOPICS    topics to copy, space separated (default "neoalice/#")
set -eu

if [ -z "${NEOALICE_MQTT_HOST:-}" ]; then
  echo "mqtt-bridge: ERROR NEOALICE_MQTT_HOST is empty. Set it in deploy/alice/.env." >&2
  exit 1
fi

conf=/tmp/mosquitto-bridge.conf
{
  echo "persistence false"
  echo "log_dest stdout"
  echo "listener 1883"
  echo "protocol mqtt"
  echo "allow_anonymous true"
  echo "listener 9001"
  echo "protocol websockets"
  echo "allow_anonymous true"
  echo "connection neoalice"
  echo "address ${NEOALICE_MQTT_HOST}:${NEOALICE_MQTT_PORT:-1883}"
  echo "cleansession true"
  echo "try_private false"
  echo "notifications false"
  if [ -n "${NEOALICE_MQTT_USERNAME:-}" ]; then
    echo "remote_username ${NEOALICE_MQTT_USERNAME}"
    echo "remote_password ${NEOALICE_MQTT_PASSWORD:-}"
  fi
  for topic in ${NEOALICE_MQTT_TOPICS:-neoalice/#}; do
    echo "topic ${topic} in 0"
  done
} > "$conf"

echo "mqtt-bridge: copies ${NEOALICE_MQTT_TOPICS:-neoalice/#} from ${NEOALICE_MQTT_HOST}:${NEOALICE_MQTT_PORT:-1883}, read only"
exec mosquitto -c "$conf"
