FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspace=@vnetwork/web
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@vnetwork/web"]
