# Sistema de Registro y Control de Asistencia

Aplicación web para registrar y consultar la asistencia de estudiantes a clases. Se reutiliza
en sucesivos módulos académicos cargando archivos Excel con los estudiantes y las fechas de
clase. **Solo hay un módulo activo a la vez**; los módulos anteriores se conservan en la base
de datos.

> Proyecto universitario (6 integrantes). Todo el texto visible está en español.
> Zona horaria de la app: `America/La_Paz`.

## Contenido

1. [Stack](#stack)
2. [Requisitos](#requisitos)
3. [Instalación en limpio (paso a paso)](#instalación-en-limpio-paso-a-paso)
4. [Usuarios y datos de prueba](#usuarios-y-datos-de-prueba)
5. [Cómo usar el sistema](#cómo-usar-el-sistema)
6. [Cumplimiento de requisitos](#cumplimiento-de-requisitos)
7. [Limitación conocida (RN-02)](#limitación-conocida-rn-02)
8. [Pruebas automáticas](#pruebas-automáticas)
9. [API](#api)
10. [Despliegue en una máquina virtual](#despliegue-en-una-máquina-virtual)
11. [Estructura del proyecto](#estructura-del-proyecto)

---

## Stack

- **Backend:** Node.js 20 + Express, Sequelize + sequelize-cli (migraciones), mysql2, jsonwebtoken, bcryptjs, zod, exceljs, multer.
- **Base de datos:** MySQL 8 (utf8mb4).
- **Frontend:** React 18 + Vite (JavaScript), react-router-dom, axios.
- **Despliegue:** Docker Compose (db + backend + frontend con nginx).

> Notas técnicas: el backend usa **CommonJS** (para que `sequelize-cli` y `Jest` funcionen sin
> configuración extra) y **bcryptjs** (JavaScript puro, sin compilación nativa, igual en Windows
> y en Docker). El frontend usa ESM (Vite).

---

## Requisitos

**Opción A (recomendada): con Docker**
- **Docker Desktop** (Windows/Mac) o Docker Engine + Compose (Linux).
- **Git**.
- Puertos libres: `80` (web), `8000` (API) y `3306` (MySQL).

**Opción B: sin Docker**
- **Node.js 20+** y **MySQL 8**, más **Git**.
- Una base vacía (`asistencia`) y un usuario con permisos sobre ella.

---

## Instalación en limpio (paso a paso)

### Con Docker

```bash
# 1. Clonar
git clone https://github.com/escobarnina/Mi-asistencia.git
cd Mi-asistencia

# 2. Variables de entorno (los valores del ejemplo sirven para una demo local)
cp .env.example .env            # en Windows (PowerShell): Copy-Item .env.example .env

# 3. Construir y levantar db + backend + frontend (las migraciones corren solas al iniciar)
docker compose up -d --build

# 4. Cargar los datos de demostración
docker compose exec backend npm run seed
```

Abrir:
- **Sistema:** http://localhost
- **Salud del backend:** http://localhost:8000/api/health → `{"status":"ok"}`

Para empezar de cero (borra la base local): `docker compose down -v`.

### Sin Docker

```bash
git clone https://github.com/escobarnina/Mi-asistencia.git
cd Mi-asistencia
cp .env.example .env            # editar: DB_HOST=localhost y las credenciales de tu MySQL
cd backend && npm install
npm run migrate                 # crea las tablas
npm run seed                    # datos de demostración
npm start                       # API en http://localhost:8000
# en otra terminal:
cd frontend && npm install && npm run dev    # http://localhost:5173
```

---

## Usuarios y datos de prueba

La semilla (`npm run seed`) es **idempotente**: se puede correr varias veces sin duplicar nada.

| Rol | Entra con | Contraseña |
|---|---|---|
| Administrador | `admin@ejemplo.com` | `Admin1234` |
| Estudiante | `est1@ejemplo.com` **o** código `220001` | _(sin contraseña)_ |
| Estudiante | `est2@ejemplo.com` **o** código `220002` | _(sin contraseña)_ |

> Los datos del admin salen de `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`.

Además crea el **Módulo 1** (gestión 2-2026), **activo**, con los 2 estudiantes inscritos y
**3 fechas de clase calculadas en La Paz: ayer, hoy y mañana (18:00–21:00)**. Así, apenas se
levanta el proyecto:

- el estudiante puede **marcar asistencia hoy**;
- ayer aparece como **Falta** automática (tanto para él como en el panel del admin);
- mañana aparece como próxima.

Si al correr la semilla ya hay otro módulo activo, no lo pisa y avisa. Cada día que se
vuelva a correr agrega las tres fechas de ese día sin duplicar.

**Excels de ejemplo** para probar la importación (formato del documento de requisitos):
[`docs/ejemplos/estudiantes.xlsx`](docs/ejemplos/estudiantes.xlsx) y
[`docs/ejemplos/fechas.xlsx`](docs/ejemplos/fechas.xlsx). Se regeneran con
`cd backend && node ../docs/ejemplos/generar.js`.

---

## Cómo usar el sistema

### Administrador (`/login` → panel `/admin`)

1. **Iniciar un módulo nuevo** — *Módulos* (`/admin/modulos`):
   1. **Crear** el módulo (queda inactivo).
   2. **Cargar datos** (`/admin/modulos/:id/datos`): subir el Excel de **estudiantes** (número de
      registro, nombre completo, correo) y el de **fechas** (fecha, hora inicio, hora fin). Cada
      archivo tiene **vista previa** (**Revisar**) antes de **Confirmar carga**; si hay un solo
      error no se guarda nada y se listan las filas a corregir.
   3. **Activar**: el botón solo se habilita si el módulo tiene al menos 1 estudiante y 1 fecha, y
      pide confirmación (*«Se activará "X" con N estudiantes y M fechas. El módulo actual dejará
      de estar activo; sus datos se conservan.»*). El módulo anterior **no se borra** y el nuevo
      empieza sin asistencias.
2. **Estudiantes** (`/admin/estudiantes`): importar al módulo activo y ver la **lista de
   estudiantes** (registro, nombre, correo) con buscador por nombre o número de registro.
3. **Asistencias** (`/admin/asistencias`): ver todas las clases del módulo activo con el estado de
   cada estudiante y los totales (presentes, faltas, pendientes); filtrar por fecha o estudiante.
   - **Corregir** una asistencia (Presente/Falta) en cualquier fecha, con un motivo obligatorio.
     Queda auditada: usuario, fecha y hora, valor anterior y nuevo.
   - **Exportar a Excel** (`.xlsx`) con los mismos estados que se ven en pantalla.
4. **Actividades** (`/admin/actividades`): historial de acciones del módulo activo (inicios y
   cierres de sesión, marcas, correcciones, importaciones, activaciones, exportaciones), con
   filtros por estudiante (nombre o registro), rango de fechas y acción, y paginación.

### Estudiante (`/login` → `/estudiante`)

1. Entra con su **correo o número de registro** (sin contraseña). Debe estar inscrito en el
   módulo activo; si no, ve un mensaje de error.
2. **Marcar asistencia**: el botón se habilita solo el **día de la clase** (todo el día, sin
   tolerancias) y permite **una sola marca** por fecha; guarda la fecha y hora reales.
3. **Historial**: lista de fechas del módulo con Presente / Falta / Pendiente / Próxima, la hora de
   cada marca y un resumen de presentes y faltas. Una fecha pasada sin marca figura como **Falta**
   automáticamente; el estudiante no puede completarla ni cambiarla (solo el admin).

---

## Cumplimiento de requisitos

### Requerimientos funcionales

| Código | Requisito | Dónde se cubre |
|---|---|---|
| RF-01 | Ingreso de estudiantes (correo o registro, solo inscritos del módulo activo, error si no) | `POST /api/auth/login` · pantalla `/login` · `authService.js` |
| RF-02 | Acceso del administrador, funciones restringidas, cerrar sesión | `POST /api/auth/login` y `/logout` · middleware `requireAdmin` · barra superior |
| RF-03 | Registrar asistencia (botón, fecha y hora reales, una marca por fecha, deshabilitado fuera de fecha) | `POST /api/asistencia/marcar`, `GET /api/asistencia/hoy` · `/estudiante` |
| RF-04 | Faltas: fecha pasada sin marca = Falta; solo el admin corrige | `services/estadoAsistencia.js` (regla única) · `/estudiante` y `/admin/asistencias` |
| RF-05 | Historial personal con hora de la marca y resumen | `GET /api/asistencia/mis-asistencias` · `/estudiante` |
| RF-06 | Lista de estudiantes del módulo activo con búsqueda | `GET /api/admin/estudiantes?q=` · `/admin/estudiantes` |
| RF-07 | Modificar asistencias con registro de cambios (usuario, fecha, hora, anterior y nuevo) | `PUT /api/admin/asistencias/:sesionId/:estudianteId` · `/admin/asistencias` · tabla `asistencia_cambio` |
| RF-08 | Vista general de asistencias con filtros y totales | `GET /api/admin/asistencias` · `/admin/asistencias` |
| RF-09 | Registro de actividades (usuario, acción, fecha y hora, registro afectado) | `ActividadService.registrar(...)` · tabla `actividad` |
| RF-10 | Consulta de actividades del módulo activo, filtros por estudiante o fecha, solo admin | `GET /api/actividades` · `/admin/actividades` |
| RF-11 | Importar estudiantes desde Excel (obligatorios, duplicados, errores por fila) | `POST /api/importacion/estudiantes` · `/admin/modulos/:id/datos` y `/admin/estudiantes` |
| RF-12 | Importar fechas y horarios (la marca se permite todo el día de clase) | `POST /api/importacion/fechas` · `asistenciaService.js` |
| RF-13 | Activar un nuevo módulo con confirmación; el nuevo empieza sin asistencias; el anterior se conserva | `POST /api/modulos/:id/activar` · `/admin/modulos` y `/admin/modulos/:id/datos` |
| RF-14 | Persistencia en base de datos | MySQL 8 + migración inicial (9 tablas) · volumen Docker `db_data` |
| RF-15 | Conservación de módulos anteriores, cada registro asociado a su módulo | `modulo_id` en inscripciones, fechas, importaciones y actividades; ver RN-08 |
| RF-16 *(opcional)* | Vista previa antes de activar un nuevo módulo | `POST /api/importacion/*/revisar` · botón **Revisar** |
| RF-17 *(opcional)* | Exportar a Excel las asistencias del módulo activo | `GET /api/admin/asistencias/exportar` (`.xlsx`) · botón **Exportar a Excel** |
| RF-18 *(opcional)* | Mensajes de confirmación y error al marcar, importar o modificar | Mensajes en español en toda la API y en las pantallas |

### Reglas de negocio

| Código | Regla | Cómo se cumple |
|---|---|---|
| RN-01 | Solo un módulo activo a la vez | Columna generada `activo_unico` con UNIQUE en `modulo` + activación en transacción (`moduloService.activar`) |
| RN-02 | Número de registro único entre los estudiantes del módulo activo | Único en `usuario` y en `inscripcion (modulo, estudiante)`; la importación rechaza duplicados. **Es más estricto que lo pedido**: ver [limitación](#limitación-conocida-rn-02) |
| RN-03 | Una sola marca por estudiante y fecha de clase | UNIQUE `(sesion_id, estudiante_id)` en `asistencia` |
| RN-04 | Solo se marca durante el día de clase programado | `asistenciaService.js` compara con la fecha de hoy en La Paz |
| RN-05 | Al terminar el día, la ausencia de marca es Falta | `estadoAsistencia.js`: fecha pasada sin registro = `FALTA` (estudiante, panel admin y Excel) |
| RN-06 | Solo el admin modifica asistencias fuera de fecha | Rutas `/api/admin/*` con `requireAdmin`; el estudiante solo puede marcar hoy |
| RN-07 | Toda modificación administrativa queda auditada | Tabla `asistencia_cambio` + registro `MODIFICAR_ASISTENCIA` en actividades |
| RN-08 | El reinicio no borra información histórica | Activar solo cambia la bandera `activo`; nada se elimina |

---

## Limitación conocida (RN-02)

El **número de registro y el correo son únicos a nivel global** (tabla `usuario`), no solo
dentro de un módulo. Un mismo estudiante se reutiliza y se vuelve a inscribir en cada módulo
nuevo sin problema, pero:

- no se puede cargar a **otra persona** con un número de registro o correo que ya pertenece a un
  estudiante de un módulo anterior;
- no se puede cambiar el correo (o el número) de un estudiante existente mediante la importación.

Hacerlos únicos solo por módulo requeriría un cambio de esquema (separar la identidad del
estudiante de su inscripción), que queda fuera de esta versión.

Otras decisiones: un módulo que ya estuvo activo y fue reemplazado no admite nuevas
importaciones (se conserva tal cual), y la consulta de módulos anteriores queda fuera del
alcance, como indica el documento de requisitos.

---

## Pruebas automáticas

Los tests (Jest + supertest) usan una base aparte, `asistencia_test`, en el **mismo MySQL** (se
crea sola). Hay 7 suites: autenticación, módulos, activación de un módulo nuevo, importación,
asistencia del estudiante, panel admin y actividades.

```bash
# Con la base levantada (docker compose up -d db). Desde tu máquina el host es localhost:
cd backend
npm install
DB_HOST=localhost npm test          # PowerShell: $env:DB_HOST='localhost'; npm test
```

---

## API

Todas las rutas cuelgan de `/api`. Salvo `health` y `login`, requieren el token
(`Authorization: Bearer <token>`).

| Área | Rutas | Rol |
|---|---|---|
| Salud | `GET /health` | público |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | todos |
| Módulos | `GET /modulos`, `GET /modulos/activo`, `GET /modulos/:id`, `POST /modulos`, `PATCH /modulos/:id`, `POST /modulos/:id/activar` | admin (`/modulos/activo` también estudiante) |
| Importación | `POST /importacion/estudiantes[/revisar]`, `POST /importacion/fechas[/revisar]` (archivo `.xlsx` en el campo `archivo`, máx. 5 MB; `modulo_id` opcional) | admin |
| Asistencia (estudiante) | `GET /asistencia/hoy`, `POST /asistencia/marcar`, `GET /asistencia/mis-asistencias` | estudiante |
| Panel admin | `GET /admin/estudiantes?q=`, `GET /admin/asistencias?fecha=&estudiante=`, `GET /admin/asistencias/exportar`, `PUT /admin/asistencias/:sesionId/:estudianteId` | admin |
| Actividades | `GET /actividades?estudiante=&fecha=&desde=&hasta=&accion=&pagina=&limite=` | admin |

El login recibe `{ "identificador": "...", "password": "..." | null }` y devuelve
`{ access_token, token_type: "bearer", usuario: { id, nombre, email, codigo, rol } }`.

---

## Despliegue en una máquina virtual

1. Instalar Docker y clonar el repositorio (`git clone https://github.com/escobarnina/Mi-asistencia.git`).
2. `cp .env.example .env` y **cambiar las claves** (contraseñas de MySQL, `JWT_SECRET`,
   `ADMIN_PASSWORD`) por valores seguros.
3. `docker compose up -d --build` y luego `docker compose exec backend npm run seed`.
4. Entrar desde el navegador: **http://IP_DE_LA_VM**

El frontend (nginx) hace de proxy de `/api` hacia el backend, así que el navegador habla siempre
con el mismo origen y no hace falta tocar CORS. `CORS_ORIGINS` solo importa en modo desarrollo
de Vite (puerto 5173).

**Base compartida (opcional, para una demo integrada):** levantar solo `db` en un lugar
(`docker compose up -d db`), aplicar migraciones y semilla una sola vez, y apuntar el `.env` de
cada integrante a esa base (`DB_HOST=IP_DE_LA_VM`, mismas credenciales). Una sola persona debería
aplicar cambios de esquema, usar contraseña fuerte y restringir el acceso a MySQL por IP.

---

## Estructura del proyecto

```
.
├── docker-compose.yml · .env.example
├── docs/ejemplos/          Excels de ejemplo (estudiantes y fechas) + generar.js
├── backend/
│   ├── Dockerfile · entrypoint.sh
│   ├── src/
│   │   ├── server.js · config/ · database.js
│   │   ├── models/         (9 tablas + asociaciones)
│   │   ├── migrations/     (1ª migración = todas las tablas)
│   │   ├── routers/        auth · modulos · importacion · asistencia · admin · actividades
│   │   ├── services/       lógica de negocio (estadoAsistencia.js = regla de Falta)
│   │   ├── schemas/ · core/ · middleware/
│   │   └── seed.js
│   └── tests/              (Jest + supertest)
└── frontend/
    ├── Dockerfile · nginx.conf · vite.config.js
    └── src/ (api/ · context/ · components/ · pages/admin · pages/estudiante)
```
