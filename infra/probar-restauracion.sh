#!/usr/bin/env bash
# Comprueba que el último respaldo sirve, SIN tocar los datos reales:
# lo restaura en una base de prueba aparte, cuenta ventas, productos y clientes, y la borra.
# Hacerlo una vez al mes:  ./probar-restauracion.sh
set -euo pipefail
cd "$(dirname "$0")"
CARPETA=/opt/farmacia/respaldos
ULTIMO=$(ls -t "$CARPETA"/db_*.dump.gpg 2>/dev/null | head -1)
[ -n "$ULTIMO" ] || { echo "No hay respaldos en $CARPETA"; exit 1; }
echo "Probando: $ULTIMO"
docker compose exec -T db psql -U farmacia -d postgres -qc 'DROP DATABASE IF EXISTS farmacia_prueba' -c 'CREATE DATABASE farmacia_prueba'
gpg --batch --quiet --decrypt --passphrase-file /root/.respaldo-clave "$ULTIMO" \
  | docker compose exec -T db pg_restore -U farmacia -d farmacia_prueba --no-owner
docker compose exec -T db psql -U farmacia -d farmacia_prueba -tAc \
  "SELECT 'Ventas: ' || (SELECT count(*) FROM \"Venta\") || ' · Productos: ' || (SELECT count(*) FROM \"Producto\") || ' · Clientes: ' || (SELECT count(*) FROM \"Paciente\")"
docker compose exec -T db psql -U farmacia -d postgres -qc 'DROP DATABASE farmacia_prueba'
echo "✔ El respaldo se puede restaurar."
