FROM node:20-alpine

# Install timezone support for Alpine and set default timezone to Buenos Aires
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Argentina/Buenos_Aires /etc/localtime && \
    echo "America/Argentina/Buenos_Aires" > /etc/timezone

ENV TZ=America/Argentina/Buenos_Aires

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Set up build argument for API URL and inject it to env
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build production assets
RUN npm run build

EXPOSE 3000

# Start production server
CMD ["npm", "run", "start"]
