#!/usr/bin/env bash
# Instalador del sistema de farmacia en un VPS con Docker.
#
#   cd /opt/farmacia/infra && sudo ./instalar.sh
#
# - Si otro proyecto (por ejemplo Kiospos) ya usa los puertos 80/443, instala en MODO COMPARTIDO:
#   la farmacia escucha solo dentro del VPS y te dice qué agregar a tu Nginx o Caddy.
# - Si los puertos están libres, instala en MODO NORMAL: la farmacia saca su propio certificado HTTPS.
# - Si ya existe infra/.env, lo reutiliza (no cambia claves ni borra datos). Sirve también para actualizar.
#
# Variables opcionales (para no responder preguntas): DOMINIO, SEED_ADMIN_USUARIO, SEED_ADMIN_NOMBRE,
# SEED_DEMO (true/false), MODO (compartido/normal), PUERTO_LOCAL.
set -euo pipefail
cd "$(dirname "$0")"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
amarillo() { printf '\033[33m%s\033[0m\n' "$*"; }
rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
paso() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
preguntar() { # preguntar VARIABLE "Texto" "valor por defecto"
  local var=$1 texto=$2 defecto=${3:-} valor
  if [ -n "${!var:-}" ]; then return; fi
  if [ -t 0 ]; then read -r -p "$texto${defecto:+ [$defecto]}: " valor; else valor=""; fi
  printf -v "$var" '%s' "${valor:-$defecto}"
}
aleatorio() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
puerto_ocupado() { ss -Htln "sport = :$1" 2>/dev/null | grep -q .; }
# Lee infra/.env línea por línea (no lo ejecuta): VARIABLE=valor, con o sin comillas.
cargar_env() {
  local linea clave valor
  while IFS= read -r linea || [ -n "$linea" ]; do
    [[ "$linea" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$linea" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    clave=${BASH_REMATCH[1]}; valor=${BASH_REMATCH[2]}
    valor=${valor%\"}; valor=${valor#\"}
    export "$clave=$valor"
  done < .env
}

# ---------- 1. Requisitos ----------
paso "Revisando el servidor"
command -v docker >/dev/null || { rojo "Docker no está instalado. Instálalo: https://docs.docker.com/engine/install/ubuntu/"; exit 1; }
docker info >/dev/null 2>&1 || { rojo "No puedo usar Docker. Ejecuta el instalador con sudo."; exit 1; }
version=$(docker compose version --short 2>/dev/null | sed 's/^v//') || { rojo "Falta Docker Compose (docker compose). Instala el paquete docker-compose-plugin."; exit 1; }
mayor=${version%%.*}; resto=${version#*.}; menor=${resto%%.*}
if [ "$mayor" -lt 2 ] || { [ "$mayor" -eq 2 ] && [ "$menor" -lt 24 ]; }; then
  rojo "Docker Compose $version es muy viejo; se necesita 2.24 o más nuevo. Actualiza docker-compose-plugin."; exit 1
fi
command -v openssl >/dev/null || { rojo "Falta openssl: apt-get install -y openssl"; exit 1; }
ram=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)
disco=$(df -Pm / | awk 'NR==2 {printf "%d", $4/1024}')
echo "Docker Compose $version · RAM libre ${ram} MB · disco libre ${disco} GB"
[ "$ram" -lt 400 ] && amarillo "Poca RAM libre: la farmacia necesita unos 150–400 MB."
[ "$disco" -lt 4 ] && { rojo "Hace falta al menos 4 GB de disco libre."; exit 1; }

# ---------- 2. Modo ----------
if [ -z "${MODO:-}" ]; then
  if puerto_ocupado 80 || puerto_ocupado 443; then MODO=compartido; else MODO=normal; fi
fi
ARCHIVOS=(-f docker-compose.yml)
[ "$MODO" = compartido ] && ARCHIVOS+=(-f docker-compose.compartido.yml)
echo "Modo: $MODO $( [ "$MODO" = compartido ] && echo '(otro proyecto ya usa los puertos 80/443)')"

# ---------- 3. Configuración (.env) ----------
CLAVES_NUEVAS=""
if [ -f .env ]; then
  paso "Usando la configuración existente (infra/.env)"
  cargar_env
else
  paso "Configuración"
  preguntar DOMINIO "Dominio o subdominio de la farmacia (ej. farmacia.tudominio.com)"
  [ -n "$DOMINIO" ] || { rojo "El dominio es obligatorio."; exit 1; }
  preguntar SEED_ADMIN_USUARIO "Usuario del dueño" "dueno"
  preguntar SEED_ADMIN_NOMBRE "Nombre del dueño" "Administrador"
  preguntar FARMACIA_NOMBRE "Nombre de la farmacia (sale en el ticket)" "Farmacia"
  preguntar FARMACIA_RIF "RIF de la farmacia (opcional)" ""
  preguntar SEED_DEMO "¿Cargar datos de ejemplo para probar? (true/false)" "true"
  SEED_ADMIN_CLAVE=$(aleatorio 16)
  SEED_DEMO_CLAVE=$( [ "$SEED_DEMO" = true ] && aleatorio 12 || echo "")
  PUERTO_LOCAL=${PUERTO_LOCAL:-8090}
  while [ "$MODO" = compartido ] && puerto_ocupado "$PUERTO_LOCAL"; do PUERTO_LOCAL=$((PUERTO_LOCAL + 1)); done
  IP_LOCAL=127.0.0.1
  # Si el proxy del otro proyecto corre dentro de Docker, debe llegar por la IP del VPS en la red de Docker.
  if [ "$MODO" = compartido ] && docker ps --format '{{.Image}} {{.Ports}}' | grep -Ei '(nginx|caddy|traefik|haproxy).*(:80->|:443->)' >/dev/null; then
    IP_LOCAL=$(ip -4 -o addr show docker0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
    IP_LOCAL=${IP_LOCAL:-172.17.0.1}
    amarillo "El proxy del otro proyecto corre dentro de Docker: la farmacia escuchará en $IP_LOCAL:$PUERTO_LOCAL"
  fi
  umask 077
  cat > .env <<EOF
# Generado por instalar.sh el $(date -Is). No subir a GitHub.
DOMINIO=$DOMINIO
DB_PASSWORD=$(aleatorio 32)
JWT_SECRET=$(aleatorio 64)
SEED_ADMIN_USUARIO=$SEED_ADMIN_USUARIO
SEED_ADMIN_NOMBRE="$SEED_ADMIN_NOMBRE"
SEED_ADMIN_CLAVE=$SEED_ADMIN_CLAVE
SEED_DEMO=$SEED_DEMO
SEED_DEMO_CLAVE=$SEED_DEMO_CLAVE
NOTIFICADOR=log
FARMACIA_NOMBRE="$FARMACIA_NOMBRE"
FARMACIA_RIF="$FARMACIA_RIF"
FARMACIA_DIRECCION=""
FARMACIA_TELEFONO=""
PUERTO_LOCAL=$PUERTO_LOCAL
IP_LOCAL=$IP_LOCAL
EOF
  chmod 600 .env
  CLAVES_NUEVAS=1
  verde "Configuración guardada en infra/.env (solo root puede leerla)"
fi
PUERTO_LOCAL=${PUERTO_LOCAL:-8090}; IP_LOCAL=${IP_LOCAL:-127.0.0.1}

# ---------- 4. Arrancar ----------
paso "Construyendo y arrancando (la primera vez tarda unos minutos)"
if [ "${SIN_COMPILAR:-}" = 1 ]; then docker compose "${ARCHIVOS[@]}" up -d --no-build
else docker compose "${ARCHIVOS[@]}" up -d --build; fi

paso "Esperando a que responda"
for i in $(seq 1 90); do
  if docker compose "${ARCHIVOS[@]}" exec -T api node -e "fetch('http://localhost:3000/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    verde "La API responde"; break
  fi
  [ "$i" = 90 ] && { rojo "La API no respondió en 3 minutos. Revisa: docker compose ${ARCHIVOS[*]} logs api"; exit 1; }
  sleep 2
done

# ---------- 5. Datos iniciales ----------
paso "Datos iniciales"
docker compose "${ARCHIVOS[@]}" exec -T api node dist/prisma/seed.js

# ---------- 6. Resumen ----------
paso "Listo"
if [ "$MODO" = compartido ]; then
  destino="http://$IP_LOCAL:$PUERTO_LOCAL"
  echo "La farmacia escucha en $destino (solo dentro del VPS)."
  if ss -Htlnp 2>/dev/null | grep -E ':(80|443) ' | grep -q caddy; then
    cat <<EOF

Agrega esto al Caddyfile de tu VPS y recarga Caddy (systemctl reload caddy):

$DOMINIO {
	reverse_proxy $IP_LOCAL:$PUERTO_LOCAL
}
EOF
  else
    cat <<EOF

Si tu VPS usa Nginx, crea /etc/nginx/sites-available/farmacia con esto:

server {
    listen 80;
    server_name $DOMINIO;
    client_max_body_size 6m;
    location / {
        proxy_pass $destino;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

Y luego:
  ln -s /etc/nginx/sites-available/farmacia /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
  certbot --nginx -d $DOMINIO

(Si usas Caddy, agrega «$DOMINIO { reverse_proxy $IP_LOCAL:$PUERTO_LOCAL }» a tu Caddyfile.)
EOF
  fi
else
  echo "Abre https://$DOMINIO (el certificado HTTPS se obtiene solo en la primera visita)."
fi

if [ -n "$CLAVES_NUEVAS" ]; then
  cat <<EOF

Usuarios (anótalos; también están en infra/.env):
  Dueño:        $SEED_ADMIN_USUARIO  /  $SEED_ADMIN_CLAVE
EOF
  [ "$SEED_DEMO" = true ] && cat <<EOF
  Cajero:       cajero        /  $SEED_DEMO_CLAVE
  Farmacéutico: farmaceutico  /  $SEED_DEMO_CLAVE
  Clienta de ejemplo: cédula V-14582307 (alérgica a la penicilina)
EOF
fi
cat <<EOF

Siguientes pasos:
  1. El dominio $DOMINIO debe apuntar (registro A) a la IP de este VPS.
  2. Entra como dueño y carga la tasa del dólar en «Resumen».
  3. Respaldos diarios: ver docs/DESPLIEGUE.md, paso 4.
EOF
