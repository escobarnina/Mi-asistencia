#!/bin/sh
set -e

# Espera a que MySQL acepte las migraciones (reintenta por si aún arranca)
# y luego levanta el servidor. docker-compose ya espera el healthcheck de db,
# este bucle es una red de seguridad adicional.
echo "Aplicando migraciones de la base de datos..."
until npm run migrate; do
  echo "La base de datos aún no está lista. Reintentando en 3 segundos..."
  sleep 3
done

echo "Migraciones aplicadas. Iniciando el backend..."
exec npm start
