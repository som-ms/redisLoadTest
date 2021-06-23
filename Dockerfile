FROM node:16
# create app directory
# RUN mkdir -p  /server
# RUN mkdir -p ./server
# RUN CHMOD -R 777
RUN mkdir -p /app
WORKDIR /app

COPY package*.json /app

RUN npm install

COPY . .

EXPOSE 8080
EntryPoint ["node", "./server/trigger.js > run.log"]