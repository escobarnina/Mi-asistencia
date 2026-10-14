FROM node:20-alpine

# tzdata para que la zona horaria America/La_Paz funcione dentro del contenedor.
RUN apk add --no-cache tzdata

WORKDIR /app

# Instala dependencias (incluye sequelize-cli para correr migraciones).
COPY package*.json ./
COPY .sequelizerc ./
RUN npm ci

# Código de la app.
COPY src ./src
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8000

# Al iniciar: aplica migraciones y luego levanta uvicorn (node).
ENTRYPOINT ["./entrypoint.sh"]
