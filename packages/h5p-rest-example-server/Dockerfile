FROM node:14 as build

# Create app directory
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run prepare
RUN npm run build

FROM node:14-alpine as production
WORKDIR /app
COPY --from=build /usr/src/app/. .

EXPOSE 8080
CMD [ "node", "build/index.js" ]

