# Fase 1 - Control de Mantenimiento Vehicular

Incluye PostgreSQL, autenticación JWT y microservicio de propietarios/vehículos.

## Despliegue en Ubuntu / VMware

Para instalar el sistema en un servidor Ubuntu y habilitar acceso desde otros dispositivos, sigue la [guía de despliegue en Ubuntu/VMware](docs/DEPLOY_UBUNTU_VMWARE.md). La configuración de producción publica el frontend por HTTP y mantiene la base de datos y las APIs internas sin puertos expuestos.

## Requisitos
- Visual Studio Code
- Docker Desktop con Docker Compose

## Arranque
1. Copia `.env.example` como `.env`.
2. En la terminal integrada ejecuta `docker compose up --build`.
3. Abre la interfaz en `http://localhost:3000`.
4. Salud: `http://localhost:3001/health` y `http://localhost:3002/health`.

El frontend React está publicado en el puerto `3000` porque el puerto `3001` ya está reservado para el API de autenticación. Desde la interfaz puedes iniciar sesión, consultar registros y crear propietarios y vehículos.

Usuario inicial: `admin@local.test`  Clave: `Admin123*`
Cámbiala antes de cualquier uso fuera de desarrollo.

## Recordatorios de próximo servicio
`order-service` revisa diariamente, a las 09:00 hora de Guatemala, las órdenes cuyo próximo servicio vence hoy o dentro de los próximos siete días. Envía email si el propietario tiene correo y SMTP está configurado; envía WhatsApp si tiene teléfono y Twilio está configurado. Los envíos se registran por orden, canal y fecha para evitar duplicados. Los fallos se pueden reintentar en el siguiente ciclo.

Configura estas variables en `.env` (no publiques credenciales):

```dotenv
SERVICE_REMINDERS_ENABLED=true
SERVICE_REMINDERS_CRON=0 9 * * *
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_CONTENT_SID=
```

WhatsApp requiere un sender habilitado y una plantilla de contenido de Twilio aprobada para recordatorios. Define `TWILIO_WHATSAPP_CONTENT_SID` y crea la plantilla con estas variables, en este orden: número de orden, nombre del propietario, servicio, fecha estimada, placa y kilometraje. Después de cambiar `.env`, recrea `order-service` con `docker compose up -d --build order-service`. Si los canales no están configurados, el scheduler se inicia pero registra un aviso y no marca recordatorios como enviados.

## Flujo de prueba
1. `POST http://localhost:3001/api/auth/login` con `{ "correo":"admin@local.test", "password":"Admin123*" }`.
2. Copia el token devuelto y úsalo como `Authorization: Bearer TOKEN`.
3. Crea propietarios y vehículos en el puerto 3002.

## Endpoints
### Auth
- POST `/api/auth/register` (solo ADMIN)
- POST `/api/auth/login`
- GET `/api/auth/profile`

### Propietarios
- GET/POST `/api/propietarios`
- GET/PUT `/api/propietarios/:id`

### Vehículos
- GET/POST `/api/vehiculos`
- GET/PUT `/api/vehiculos/:id`

## Restablecer la base
`docker compose down -v` y luego `docker compose up --build`.

## Alcance
El sistema incluye órdenes, historial por vehículo, interfaz frontend y recordatorios de próximo servicio por correo y WhatsApp. Los recordatorios se revisan diariamente a las 09:00 hora de Guatemala para servicios que vencen dentro de los siguientes siete días. SMTP y Twilio requieren credenciales propias configuradas en `.env`; WhatsApp requiere una plantilla aprobada de Twilio. Kubernetes queda fuera del alcance actual.
