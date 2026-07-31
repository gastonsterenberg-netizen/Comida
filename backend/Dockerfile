FROM node:20-alpine

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
