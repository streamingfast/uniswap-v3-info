FROM nginx:stable-alpine

COPY build /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
