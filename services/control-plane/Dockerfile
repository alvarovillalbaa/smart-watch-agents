FROM node:25-alpine
WORKDIR /app
COPY package.json ./
COPY services/control-plane/package.json services/control-plane/package.json
RUN npm install --omit=dev --workspace @watch-agents/control-plane
COPY services/control-plane ./services/control-plane
COPY contracts ./contracts
EXPOSE 8787
CMD ["npm", "--workspace", "@watch-agents/control-plane", "start"]
