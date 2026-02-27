FROM node:20-alpine

WORKDIR /app

# Copy root package.json and lerna config for workspace resolution
COPY package.json lerna.json ./
COPY tsconfig.base.json ./

# Copy service specific files
COPY services/post-service ./services/post-service

# Install dependencies and build
RUN npm install
RUN npm run build --workspace=services/post-service

CMD ["npm", "run", "start", "--workspace=services/post-service"]
