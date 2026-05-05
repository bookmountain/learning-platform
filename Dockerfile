FROM node:22-alpine

ENV NODE_ENV=production \
    NODE_OPTIONS=--no-warnings=ExperimentalWarning \
    HOST=0.0.0.0 \
    PORT=5177

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
COPY requirements.txt ./

RUN mkdir -p resources/courses resources/tutorials data

EXPOSE 5177

CMD ["node", "server.js"]
