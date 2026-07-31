FROM node:20-alpine

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
