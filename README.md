# Fase 1 - Control de Mantenimiento Vehicular

Incluye PostgreSQL, autenticación JWT y microservicio de propietarios/vehículos.

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
Esta fase no incluye todavía órdenes, historial, frontend, WhatsApp ni Kubernetes. Se incorporan en fases posteriores.
