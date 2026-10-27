# Despliegue en Ubuntu (VMware)

Esta configuración publica la aplicación por un único puerto HTTP y mantiene PostgreSQL y las APIs internas sin puertos publicados. El frontend enruta `/api/...` a cada microservicio mediante Nginx, así que los dispositivos usan la dirección del servidor Ubuntu, no `localhost`.

## 1. Preparar Ubuntu

Instala Docker Engine y el complemento Docker Compose siguiendo la documentación oficial de Docker para Ubuntu. Comprueba:

```bash
docker --version
docker compose version
```

Clona o copia el proyecto en Ubuntu, entra en la carpeta raíz del proyecto y confirma la IP de la VM:

```bash
ip -br address
```

## 2. Configurar secretos

```bash
cp deploy/.env.ubuntu.example .env
openssl rand -hex 32
```

Genera dos valores distintos con `openssl rand -hex 32`. Pégalos en `.env` como `POSTGRES_PASSWORD` y `JWT_SECRET`. Completa también `GEMINI_API_KEY` si se usará el asistente. Protege el archivo:

```bash
chmod 600 .env
```

No publiques ni compartas `.env`. Usa claves hexadecimales para evitar caracteres que compliquen la URL de PostgreSQL.

## 3. Arrancar la aplicación

Desde la raíz del proyecto:

```bash
docker compose -f compose.ubuntu.yaml up -d --build
docker compose -f compose.ubuntu.yaml ps
```

La primera ejecución crea el volumen y aplica `database/init.sql`. Para ver errores:

```bash
docker compose -f compose.ubuntu.yaml logs -f
```

No ejecutes `docker compose down -v` en producción: eliminaría la base de datos.

## Conservar los datos del servidor actual

Antes de migrar, crea un respaldo en la máquina donde corre actualmente Docker Compose. Desde PowerShell, en la carpeta del proyecto:

```powershell
docker compose exec -T postgres pg_dump -U mantenimiento -d control_mantenimiento -Fc -f /tmp/control_mantenimiento.dump
docker compose cp postgres:/tmp/control_mantenimiento.dump .\control_mantenimiento.dump
```

Transfiere `control_mantenimiento.dump` a la carpeta del proyecto en Ubuntu, por ejemplo con `scp`. En Ubuntu, levanta los servicios y copia el respaldo al contenedor PostgreSQL:

```bash
docker compose -f compose.ubuntu.yaml up -d postgres
docker compose -f compose.ubuntu.yaml cp ./control_mantenimiento.dump postgres:/tmp/control_mantenimiento.dump
docker compose -f compose.ubuntu.yaml exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/control_mantenimiento.dump'
```

Luego arranca los demás servicios:

```bash
docker compose -f compose.ubuntu.yaml up -d --build
```

Guarda el respaldo fuera del servidor y no lo subas al repositorio: contiene datos de la base. Si los nombres de usuario o base actuales no son `mantenimiento` y `control_mantenimiento`, ajusta el comando de `pg_dump` según el `.env` de origen.

## 4. Acceso desde dispositivos de la red local

En Ubuntu permite el puerto web y, si usas SSH, conserva también ese acceso:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

En VMware selecciona **Bridged / Adaptador puente** para que la VM reciba una IP de la misma red que los demás dispositivos. Si la VM usa NAT, configura el reenvío de puertos en VMware hacia el puerto 80 de la VM; el modo puente suele ser más sencillo para acceso LAN.

Desde un celular o computadora conectados a esa red, abre `http://IP_DE_UBUNTU/`, por ejemplo `http://192.168.1.50/`. Para una dirección estable, reserva la IP de la VM en el router.

Antes de habilitar acceso de otros usuarios, cambia la contraseña inicial de `admin@local.test` desde la administración de usuarios.

## 5. Acceso desde Internet

La IP privada de una VM solo funciona dentro de la red local. Para entrar desde fuera, se necesita además:

1. Una IP pública accesible o un túnel/VPN.
2. Un dominio DNS apuntando a esa IP.
3. Un proxy HTTPS (por ejemplo Caddy) y certificado TLS válido.
4. Reenvío del router solo de los puertos 80/443 al proxy; no publiques PostgreSQL ni los puertos 3001–3005.

No expongas la aplicación directamente por HTTP en Internet. Mantén el acceso administrativo a Ubuntu restringido y realiza copias de seguridad regulares del volumen `postgres_data`.

## Actualizar el sistema

```bash
git pull
docker compose -f compose.ubuntu.yaml up -d --build
```
