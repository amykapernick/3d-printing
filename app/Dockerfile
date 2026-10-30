# Production image for the SvelteKit PWA (adapter-node).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# poppler-utils provides `pdftotext`, used to read Bambu invoice PDFs
RUN apk add --no-cache poppler-utils
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
EXPOSE 3000
CMD ["node", "build"]
