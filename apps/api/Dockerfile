FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspace=@vnetwork/api

# Entrypoint runs DB migrations (with retry) before exec-ing the CMD / compose `command:`.
# The worker service in docker-compose sets SKIP_MIGRATE=true to avoid concurrent migrate runs.
COPY infra/entrypoint-api.sh /usr/local/bin/entrypoint-api.sh
RUN chmod +x /usr/local/bin/entrypoint-api.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint-api.sh"]
CMD ["npm", "run", "start", "--workspace=@vnetwork/api"]
