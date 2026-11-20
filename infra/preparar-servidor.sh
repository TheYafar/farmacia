#!/usr/bin/env bash
# Preparación inicial del VPS (Ubuntu 24.04 en Contabo). Ejecutar una sola vez como root.
# No desactiva el acceso con contraseña por SSH: hazlo a mano DESPUÉS de comprobar que entras con tu llave (ver docs/DESPLIEGUE.md).
set -euo pipefail

apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades rclone

# Actualizaciones de seguridad automáticas
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker oficial
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Cortafuegos: solo SSH, HTTP y HTTPS
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Bloquea IPs que prueban claves por SSH
systemctl enable --now fail2ban

mkdir -p /opt/farmacia
echo "Listo. Siguiente paso: clonar el repositorio en /opt/farmacia (ver docs/DESPLIEGUE.md)."
