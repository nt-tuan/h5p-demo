# build environment
FROM node:14-alpine as build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm install
COPY . /app
RUN npm run build

# production environment
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY dockerfiles/nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

# Copy .env file and shell script to container
WORKDIR /usr/share/nginx/html

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
