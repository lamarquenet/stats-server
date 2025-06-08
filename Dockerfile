FROM nvidia/cuda:12.9.0-base-ubuntu22.04

# Install Node.js (use setup script for latest Node 23)
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_23.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

EXPOSE 8002

ENV RUNNING_IN_DOCKER=true

CMD ["npm", "start"]
