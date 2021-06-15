FROM node:14-alpine
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
# CMD ["node", "subscriber.js"]
