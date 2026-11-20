#!/usr/bin/env bash
# Emergencia: quita la clave de dos pasos de un usuario que perdió su teléfono.
#   ./quitar-dos-pasos.sh dueno
set -euo pipefail
cd "$(dirname "$0")"
USUARIO=${1:?Uso: ./quitar-dos-pasos.sh usuario}
docker compose exec -T api node dist/prisma/quitar-2fa.js "$USUARIO"
