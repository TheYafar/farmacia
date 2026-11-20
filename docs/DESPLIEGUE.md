# Despliegue en Contabo

Guía para poner el sistema en un VPS de Contabo con Ubuntu 24.04. Tiempo aproximado: una hora.

## Antes de empezar

- Un VPS de Contabo con **Ubuntu 24.04** (el plan más pequeño alcanza para una farmacia).
- Un **dominio** (ej. `mostrador.farmaciaavila.com`) con un registro **A** apuntando a la IP del VPS.
- Una **llave SSH** en tu computadora (`ssh-keygen -t ed25519` si no tienes).

## 1. Entrar al servidor y prepararlo

```bash
ssh-copy-id root@IP_DEL_VPS
```

```bash
ssh root@IP_DEL_VPS
```

```bash
git clone https://github.com/TheYafar/farmacia.git /opt/farmacia
```

```bash
bash /opt/farmacia/infra/preparar-servidor.sh
```

Esto instala Docker, activa el cortafuegos (solo SSH, HTTP y HTTPS), fail2ban y las actualizaciones de seguridad automáticas.

**Cerrar el acceso por contraseña** (solo después de comprobar que entras con tu llave desde otra ventana): en `/etc/ssh/sshd_config` poner `PasswordAuthentication no` y luego:

```bash
systemctl restart ssh
```

## 2. Configurar

```bash
cd /opt/farmacia/infra && cp .env.example .env && chmod 600 .env
```

Genera los secretos y pégalos en `.env` con `nano .env`:

```bash
echo "DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')"; echo "JWT_SECRET=$(openssl rand -base64 48)"
```

Pon también `DOMINIO` y una clave temporal en `SEED_ADMIN_CLAVE`.

## 3. Arrancar

```bash
docker compose up -d --build
```

```bash
docker compose exec api node dist/prisma/seed.js
```

Abre `https://TU_DOMINIO`. Caddy obtiene el certificado HTTPS solo en el primer acceso. Entra con el usuario del dueño, **cambia la clave** y borra `SEED_ADMIN_CLAVE` del `.env`.

Comprobar que todo responde:

```bash
curl https://TU_DOMINIO/api/v1/salud
```

## 4. Respaldos diarios

```bash
openssl rand -base64 32 > /root/.respaldo-clave && chmod 600 /root/.respaldo-clave && cat /root/.respaldo-clave
```

**Guarda esa frase fuera del servidor** (gestor de claves). Sin ella los respaldos no se pueden abrir.

```bash
crontab -e
```

Agrega esta línea:

```
0 3 * * * /opt/farmacia/infra/respaldo.sh >> /var/log/farmacia-respaldo.log 2>&1
```

Para copiar los respaldos fuera del VPS (recomendado), configura un destino con `rclone config` (por ejemplo Backblaze B2) y agrega `RCLONE_DESTINO=nombre:carpeta` al inicio de la línea del cron.

Restaurar (reemplaza los datos actuales):

```bash
/opt/farmacia/infra/restaurar.sh /opt/farmacia/respaldos/db_FECHA.dump.gpg
```

## 5. Actualizar a una versión nueva

```bash
cd /opt/farmacia && git pull && cd infra && docker compose up -d --build
```

Las migraciones de la base de datos se aplican solas al arrancar la API. Haz un respaldo manual antes de cada actualización:

```bash
/opt/farmacia/infra/respaldo.sh
```

## Problemas comunes

| Síntoma | Qué revisar |
|---|---|
| El navegador dice que el certificado no es válido | El dominio todavía no apunta a la IP, o los puertos 80/443 están cerrados en el panel de Contabo |
| `docker compose up` dice «Falta DB_PASSWORD» | Falta llenar `infra/.env` |
| La API se reinicia sola | `docker compose logs api` — suele ser la configuración |
| «Falta cargar la tasa del dólar de hoy» al vender | El dueño debe cargar la tasa en Resumen |
