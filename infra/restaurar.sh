#!/usr/bin/env bash
# Restaura la base de datos desde un respaldo. ¡Reemplaza los datos actuales!
#   ./restaurar.sh /opt/farmacia/respaldos/db_2026-11-20_0300.dump.gpg
set -euo pipefail
ARCHIVO=${1:?Uso: ./restaurar.sh archivo.dump.gpg}
cd "$(dirname "$0")"
read -r -p "Esto reemplaza TODOS los datos actuales. Escribe RESTAURAR para seguir: " ok
[ "$ok" = "RESTAURAR" ] || exit 1
gpg --batch --decrypt --passphrase-file /root/.respaldo-clave "$ARCHIVO" \
  | docker compose exec -T db pg_restore -U farmacia -d farmacia --clean --if-exists --no-owner
echo "Restaurado desde $ARCHIVO"
