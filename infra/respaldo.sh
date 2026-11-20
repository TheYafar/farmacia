#!/usr/bin/env bash
# Copia de seguridad diaria: base de datos + fotos de récipes, cifradas.
# Programar a las 3:00 a. m. (documento, sección 9):
#   0 3 * * * /opt/farmacia/infra/respaldo.sh >> /var/log/farmacia-respaldo.log 2>&1
#
# Necesita:
#   /root/.respaldo-clave   → frase para cifrar (chmod 600). Sin ella no se pueden recuperar los respaldos: guárdala también fuera del servidor.
#   RCLONE_DESTINO (opcional) → ej. "b2:farmacia-respaldos" para copiar fuera del VPS.
set -euo pipefail
umask 077

CARPETA=/opt/farmacia/respaldos
CLAVE=/root/.respaldo-clave
DIAS=14
FECHA=$(date +%Y-%m-%d_%H%M)
cd "$(dirname "$0")"

[ -f "$CLAVE" ] || { echo "Falta $CLAVE"; exit 1; }
mkdir -p "$CARPETA" && chmod 700 "$CARPETA"

docker compose exec -T db pg_dump -U farmacia -Fc farmacia \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$CLAVE" -o "$CARPETA/db_$FECHA.dump.gpg"

docker run --rm -v farmacia_uploads:/datos:ro alpine tar -C /datos -czf - . \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$CLAVE" -o "$CARPETA/recipes_$FECHA.tar.gz.gpg"

find "$CARPETA" -name '*.gpg' -mtime +$DIAS -delete

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$CARPETA" "$RCLONE_DESTINO" --max-age 2d
fi
echo "$(date -Is) respaldo OK: $FECHA"
