# Despliegue en Contabo

Guía para poner el sistema en un VPS de Contabo con Ubuntu 24.04. Tiempo aproximado: una hora.

## Antes de empezar

- Un VPS de Contabo con **Ubuntu 24.04** (el plan más pequeño alcanza para una farmacia).
- Un **dominio** (ej. `mostrador.farmaciaavila.com`) con un registro **A** apuntando a la IP del VPS.
- Una **llave SSH** en tu computadora (`ssh-keygen -t ed25519` si no tienes).

> **¿El VPS ya tiene otro proyecto (por ejemplo Kiospos)?** Sigue la sección [«VPS compartido»](#vps-compartido-con-otro-proyecto) al final en vez de los pasos 1 y 3: no hay que tocar nada de lo que ya funciona.

## Instalación rápida (recomendada)

Un solo comando hace todo: revisa el VPS, detecta si otro proyecto usa los puertos 80/443 (modo compartido), genera las claves, arranca, crea los usuarios y muestra la configuración exacta para tu Nginx o Caddy.

```bash
git clone https://github.com/TheYafar/farmacia.git /opt/farmacia
```

```bash
cd /opt/farmacia/infra && sudo ./instalar.sh
```

Te pregunta el dominio, el usuario y nombre del dueño, y si cargar datos de ejemplo. Al final imprime las claves (guárdalas) y los pasos que faltan. Para **actualizar** a una versión nueva:

```bash
cd /opt/farmacia && git pull && cd infra && sudo ./instalar.sh
```

Reutiliza la configuración: no cambia claves ni borra datos. Los pasos de abajo explican lo mismo a mano.

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

**Probar que el respaldo sirve** (una vez al mes): `./probar-restauracion.sh` lo restaura en una base de prueba aparte, muestra cuántas ventas, productos y clientes tiene, y la borra. No toca los datos reales.

**Aviso si el sistema se cae:** crea un monitor gratuito en [UptimeRobot](https://uptimerobot.com) (tipo HTTP(s)) a `https://TU-DOMINIO/api/v1/salud` cada 5 minutos, con aviso por correo o Telegram.

**Clave de dos pasos del dueño:** en la app, *Usuarios → Clave de dos pasos → Activar*, y escanear el código con Google Authenticator o Authy.

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

## VPS compartido con otro proyecto

Para un VPS que ya usa los puertos 80 y 443 (por ejemplo, con Kiospos). La farmacia corre en sus propios contenedores, con **su propia base de datos**, y solo escucha en `127.0.0.1:8090`. El servidor web que ya tiene el VPS (Nginx o Caddy) le pasa las visitas de un subdominio, con HTTPS.

### 1. Revisar el VPS

```bash
free -h && df -h / && docker ps --format '{{.Names}}\t{{.Ports}}'
```

Medido en pruebas: la farmacia usa **unos 100 MB de RAM en reposo** (API, base de datos y web juntas) y **unos 1,3 GB de disco** en imágenes, más espacio temporal al compilar. Con al menos 1 GB de RAM y 5 GB de disco libres alcanza con holgura.

```bash
sudo ss -tlnp | grep -E ':(80|443|8090) '
```

Esto dice quién usa los puertos 80 y 443 (`nginx`, `caddy`, `docker-proxy`…) y confirma que el 8090 está libre. Si el 8090 está ocupado, usa otro en `PUERTO_LOCAL`.

**No ejecutes `preparar-servidor.sh`** en un VPS compartido: activa un cortafuegos que podría cerrar puertos que usa el otro proyecto.

### 2. Subdominio

En el panel de tu dominio crea un registro **A**, por ejemplo `farmacia.tudominio.com`, con la misma IP del VPS.

### 3. Instalar y arrancar

```bash
git clone https://github.com/TheYafar/farmacia.git /opt/farmacia
```

```bash
cd /opt/farmacia/infra && cp .env.example .env && chmod 600 .env
```

En `.env` pon `DOMINIO=farmacia.tudominio.com`, los secretos (paso 2 de arriba) y, para un servidor de pruebas, `SEED_DEMO=true` y una clave en `SEED_DEMO_CLAVE`.

```bash
docker compose -f docker-compose.yml -f docker-compose.compartido.yml up -d --build
```

```bash
docker compose exec api node dist/prisma/seed.js
```

Comprobar que responde dentro del VPS:

```bash
curl http://127.0.0.1:8090/api/v1/salud
```

### 4a. Si el VPS usa Nginx

Crea `/etc/nginx/sites-available/farmacia`:

```nginx
server {
    listen 80;
    server_name farmacia.tudominio.com;
    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/farmacia /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d farmacia.tudominio.com
```

### 4b. Si el VPS usa Caddy

Agrega al `Caddyfile` del VPS y recarga Caddy:

```
farmacia.tudominio.com {
	reverse_proxy 127.0.0.1:8090
}
```

### 4c. Si el otro proyecto tiene su proxy dentro de Docker

Si Nginx o Caddy corren en un contenedor, `127.0.0.1` dentro del contenedor no es el VPS. En `infra/.env` pon `IP_LOCAL=172.17.0.1` (la IP del VPS en la red de Docker), vuelve a arrancar la farmacia y en el proxy usa `http://172.17.0.1:8090`.

### Usuarios para probar

Con `SEED_DEMO=true` y `SEED_DEMO_CLAVE`, quedan creados:

| Usuario | Rol | Clave |
|---|---|---|
| `dueno` (o el de `SEED_ADMIN_USUARIO`) | Dueño | `SEED_ADMIN_CLAVE` |
| `cajero` | Cajero | `SEED_DEMO_CLAVE` |
| `farmaceutico` | Farmacéutico | `SEED_DEMO_CLAVE` |

También queda una clienta de ejemplo, cédula **V-14582307**, alérgica a la penicilina, para probar los avisos.

Los respaldos (`respaldo.sh`) y las actualizaciones funcionan igual; para actualizar en modo compartido:

```bash
cd /opt/farmacia && git pull && cd infra && docker compose -f docker-compose.yml -f docker-compose.compartido.yml up -d --build
```

## Panel central (super admin) y soporte en línea

El servidor de quien vende el sistema funciona también como **panel central**: ahí se ven todas las farmacias, su estado y los casos de soporte.

1. **Crear el super admin** (una vez, en el servidor del panel central):
   ```bash
   cd /opt/farmacia/infra && ./crear-superadmin.sh admin.central "Tu nombre"
   ```
   Muestra una clave aleatoria. Entra con ese usuario: verás **Farmacias**, **Casos de soporte** y **Equipo**.
2. **WhatsApp de soporte** (opcional): en el `.env` del panel central pon `SOPORTE_TELEFONO=584145550192`. Las farmacias enlazadas lo ven en su pantalla de entrada y en Soporte.
3. **Registrar una farmacia:** Farmacias → Registrar farmacia. Sale un **código de enlace** (empieza por `FT1.`), que solo se muestra una vez.
4. **En la farmacia**, el dueño va a **Soporte → Enlazar con soporte** y pega el código. Desde ahí la farmacia se reporta sola cada 5 minutos: ventas de hoy, cajas abiertas, tasa, errores recientes, espacio en disco y versión. No se envían datos de clientes.
5. **Casos:** cualquier usuario de la farmacia puede pedir ayuda desde Soporte. El caso llega al panel con el estado del sistema de ese momento, y la respuesta se ve en la farmacia.
6. **Acceso remoto:** solo si el dueño lo permite (Soporte → Acceso remoto, de 1 a 24 horas), aparece el botón **Entrar** en el panel. Soporte entra como «Soporte técnico»: todo queda en la auditoría, y el dueño ve un aviso arriba con un botón para quitar el acceso al instante.

Si un código se filtra, genera uno nuevo desde la ficha de la farmacia: el anterior deja de funcionar. Para dar de baja a una farmacia, usa **Desactivar**.

## Cajas (equipos de cobro)

Cada computadora o tablet donde se cobra puede ser una **caja**.

- **Crear una caja:** al abrir la caja en un equipo nuevo, toca «Crear caja aquí». El dueño también puede crearlas desde **Cajas**.
- **Pasarla a otro equipo** (por ejemplo, a una tablet): en Caja, o en Cajas si eres el dueño, toca **Pasar a otro equipo**. Sale un código de 6 letras que vale 30 minutos y sirve una sola vez. En la tablet, en la pantalla de entrada, toca «Tengo un código».
- **Qué ve el dueño en Cajas:** en qué equipos está cada caja, quién la tiene abierta y cuánto vendió hoy. Puede quitar un equipo o desactivar la caja.
- **Una persona a la vez:** si la caja ya está abierta por alguien, otra persona no puede abrirla al mismo tiempo.
- **Entrar con correo:** el dueño puede ponerle correo a cada usuario (en Usuarios) para que entre con el correo en lugar del usuario.

## Demo con datos de ejemplo

La pantalla de entrada tiene el botón **Prueba la demo**. Se puede entrar como dueño, farmacéutico o cajero, sin clave.

- **Datos separados:** la demo usa un esquema aparte de la base de datos (`demo`), con una farmacia inventada que tiene productos, clientes, dos meses de ventas, cierres, encargos y compras. Lo que se haga en la demo nunca toca la farmacia real.
- **Se reinicia sola:** los datos se borran y se vuelven a cargar cada noche.
- **Lo que no se puede hacer en la demo:** crear usuarios, subir fotos de récipes ni usar soporte.
- **Para quitar el botón:** pon `DEMO=false` en el `.env` y corre `./instalar.sh`.

## Planes

Desde el panel central, el super admin decide qué trae cada plan (menú **Planes**). Se arranca con tres:

| Plan | Precio | Módulos extra | Cajas | Usuarios |
|---|---|---|---|---|
| Mostrador | 30 $/mes | Encargos | 1 | 4 |
| Profesional | 50 $/mes | Encargos, Compras, Reportes, WhatsApp | 3 | 10 |
| Completo | 70 $/mes | Todo, incluido Al mayor | sin límite | sin límite |

- **En todos los planes** van Vender, Caja, Ventas, Récipe, Por revisar, Controlados, Clientes, Inventario, Catálogo, Resumen, Cajas, Usuarios, Auditoría y Soporte. Sin ellos la farmacia no puede operar ni cumplir con los controlados.
- **Asignar un plan:** Farmacias → la farmacia → Editar → Plan. La farmacia lo recibe en su siguiente reporte, como máximo en 5 minutos.
- **Lo que no trae el plan** desaparece del menú y el servidor lo rechaza. El dueño ve su plan en Configuración.
- **Límites:** no se pueden crear más cajas ni usuarios activos que los del plan. Los que ya existían siguen funcionando.
- **Farmacia sin plan o sin enlazar:** tiene todo disponible. Si se desenlaza, conserva el último plan que recibió.
