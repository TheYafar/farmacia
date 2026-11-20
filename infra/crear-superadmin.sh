#!/usr/bin/env bash
# Crea el super admin del panel central (ve todas las farmacias y da soporte).
#   ./crear-superadmin.sh admin.central "Tu nombre"
# Si ya existe, le pone una clave nueva.
set -euo pipefail
cd "$(dirname "$0")"
USUARIO=${1:?Uso: ./crear-superadmin.sh usuario "Nombre"}
docker compose exec -T api node dist/prisma/crear-superadmin.js "$USUARIO" "${2:-Super admin}"
