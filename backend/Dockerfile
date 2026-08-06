FROM node:20-alpine

# Install timezone support for Alpine and set default timezone to Buenos Aires
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Argentina/Buenos_Aires /etc/localtime && \
    echo "America/Argentina/Buenos_Aires" > /etc/timezone

ENV TZ=America/Argentina/Buenos_Aires

WORKDIR /app

# Copy dependency definition files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy the rest of the source code
COPY . .

# Generate the Prisma Client code based on schema
RUN npx prisma generate

# Compile TypeScript code
RUN npm run build

# Expose backend API port
EXPOSE 3001

# Run the compiled application
CMD ["npm", "run", "start"]
