# Sistema de Registro y Control de Asistencia

Base del núcleo (core) del sistema de asistencia. Esta primera entrega deja
**login y logout funcionando** y toda la estructura lista para que el equipo
construya el resto de funciones encima.

> Proyecto universitario (6 integrantes). Todo el texto visible está en español.
> Zona horaria de la app: `America/La_Paz`.

## Stack

- **Backend:** Node.js 20 + Express, Sequelize + sequelize-cli (migraciones), mysql2, jsonwebtoken, bcrypt, zod.
- **Base de datos:** MySQL 8 (utf8mb4).
- **Frontend:** React 18 + Vite (JavaScript), react-router-dom, axios.
- **Despliegue:** Docker Compose (db + backend + frontend con nginx).

_(Las secciones de instalación, semilla, pruebas y despliegue se completan al final del desarrollo.)_
