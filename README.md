# Sistema de Registro y Control de Asistencia

Base del núcleo (core) del sistema de asistencia. Esta primera entrega deja
**login y logout funcionando** y toda la estructura lista para que el equipo
construya el resto de funciones encima.

> Proyecto universitario (6 integrantes). Todo el texto visible está en español.
> Zona horaria de la app: `America/La_Paz`.

## Stack

- **Backend:** Node.js 20 + Express, Sequelize + sequelize-cli (migraciones), mysql2, jsonwebtoken, bcryptjs, zod.
- **Base de datos:** MySQL 8 (utf8mb4).
- **Frontend:** React 18 + Vite (JavaScript), react-router-dom, axios.
- **Despliegue:** Docker Compose (db + backend + frontend con nginx).

> Notas técnicas: el backend usa **CommonJS** (para que `sequelize-cli` y `Jest`
> funcionen sin configuración extra) y **bcryptjs** (bcrypt en JavaScript puro,
> sin compilación nativa, igual en Windows y en Docker). El frontend usa ESM (Vite).

---

## Requisitos

- **Docker** y **Docker Compose** (Docker Desktop en Windows/Mac).
- **Git**.
- (Opcional) **Node.js 20+** si quieres correr los tests o la semilla desde tu máquina.

---

## Cómo levantar en local

1. Copia las variables de ejemplo y ajústalas:
   ```bash
   cp .env.example .env
   ```
2. Levanta todo:
   ```bash
   docker compose up -d --build
   ```
3. Carga los datos iniciales (semilla):
   ```bash
   docker compose exec backend npm run seed
   ```
4. Abre el sistema:
   - **Frontend:** http://localhost
   - **Backend (healthcheck):** http://localhost:8000/api/health → `{"status":"ok"}`

### Usuarios de prueba (los crea la semilla)

| Rol | Entra con | Contraseña |
|---|---|---|
| Administrador | `admin@ejemplo.com` | `Admin1234` |
| Estudiante | `est1@ejemplo.com` **o** código `220001` | _(sin contraseña)_ |
| Estudiante | `est2@ejemplo.com` **o** código `220002` | _(sin contraseña)_ |

> Los valores del admin salen de `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`.

---

## Cómo correr la semilla

La semilla es **idempotente** (se puede correr varias veces sin duplicar datos).
Crea el admin, un "Módulo 1" activo de gestión "2-2026" y 2 estudiantes inscritos.

```bash
# Dentro de Docker (recomendado):
docker compose exec backend npm run seed

# O desde tu máquina (necesita Node y la base accesible en DB_HOST):
cd backend && npm install && npm run seed
```

---

## Cómo correr los tests

Los tests (Jest + supertest) usan una base aparte llamada `asistencia_test`
en el **mismo MySQL** (se crea automáticamente). Prueban: login de admin
(correcto/incorrecto), login de estudiante por correo y por código, estudiante
no inscrito, logout que invalida el token, y el registro de `LOGIN`, `LOGOUT`
y `LOGIN_FALLIDO` en el historial.

```bash
# Con la base levantada (docker compose up -d db) y un .env con DB_HOST=localhost:
cd backend
npm install
npm test
```

---

## Cómo desplegar en la máquina virtual (VM)

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/escobarnina/Mi-asistencia.git
   cd Mi-asistencia
   ```
2. Crear el `.env` a partir del ejemplo y **cambiar las claves** (contraseñas de
   MySQL, `JWT_SECRET`) por valores seguros:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Levantar todo:
   ```bash
   docker compose up -d --build
   ```
4. Cargar la semilla:
   ```bash
   docker compose exec backend npm run seed
   ```
5. Entrar desde el navegador: **http://IP_DE_LA_VM**

> Como el frontend (nginx) hace de proxy de `/api` hacia el backend, el navegador
> habla siempre con el mismo origen (la IP de la VM), así que no hace falta tocar
> CORS. `CORS_ORIGINS` solo importa para el modo desarrollo de Vite (puerto 5173).

---

## Base de datos compartida (opcional, para integración/demo)

Por defecto cada integrante levanta su **propia base local** y corre `npm run seed`
para tener la **misma data** (nadie puebla a mano). Si en cambio quieren **una sola
base física** donde todos vean los mismos datos (p. ej. para la demo integrada):

1. Montar la base en un solo lugar (lo natural: la **VM del docente**):
   ```bash
   docker compose up -d db
   ```
2. Aplicar migraciones y semilla **una sola vez** contra esa base.
3. Cada compañero apunta su `.env` a esa base (sin levantar su propio `db`):
   ```
   DB_HOST=IP_DE_LA_VM
   DB_PORT=3306
   MYSQL_DATABASE=asistencia
   MYSQL_USER=asistencia
   MYSQL_PASSWORD=la_misma_clave
   ```
   y levanta solo backend/frontend.

**Cuidados:** una sola persona debería aplicar cambios de esquema (migraciones) para
no romperle la base a los demás; usar contraseña fuerte y, de ser posible, restringir
el acceso por IP (no exponer MySQL abiertamente a internet).

---

## Endpoints de autenticación (ya implementados)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del backend. |
| `POST` | `/api/auth/login` | Login. Body: `{ "identificador": "...", "password": "..." \| null }`. |
| `POST` | `/api/auth/logout` | Cierra sesión (revoca el token). Requiere token. |
| `GET` | `/api/auth/me` | Devuelve el usuario del token. Requiere token. |

El login devuelve: `{ access_token, token_type: "bearer", usuario: { id, nombre, email, codigo, rol } }`.

---

## Trabajo del equipo (routers preparados)

Cada router está creado y montado bajo `/api`. Cada integrante trabaja en **su
archivo** para no chocar. Usen `ActividadService.registrar(...)` para dejar
registro en el historial (RF-09).

| Router (archivo) | Ruta base | Requisitos | Responsable |
|---|---|---|---|
| `src/routers/auth.js` | `/api/auth` | RF-01, RF-02, RF-09 | **Núcleo (ya hecho)** |
| `src/routers/modulos.js` | `/api/modulos` | RF-13 | _asignar_ |
| `src/routers/importacion.js` | `/api/importacion` | RF-11, RF-12, RF-16 | _asignar_ |
| `src/routers/asistencia.js` | `/api/asistencia` | RF-03 a RF-05 | _asignar_ |
| `src/routers/admin.js` | `/api/admin` | RF-06 a RF-08, RF-17 | _asignar_ |
| `src/routers/actividades.js` | `/api/actividades` | RF-10 | _asignar_ |

---

## Estructura del proyecto

```
.
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile · entrypoint.sh
│   └── src/
│       ├── server.js · config/ · database.js
│       ├── models/        (9 tablas + asociaciones)
│       ├── migrations/     (1ª migración = todas las tablas)
│       ├── schemas/ · services/ · routers/ · core/ · middleware/
│       └── seed.js
│   └── tests/              (Jest + supertest)
└── frontend/
    ├── Dockerfile · nginx.conf · vite.config.js
    └── src/ (api/ · context/ · components/ · pages/)
```
