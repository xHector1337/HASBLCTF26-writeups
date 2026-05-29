FROM nginx:1.27-alpine

COPY *.html /usr/share/nginx/html/
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY flag.txt /usr/share/nginx/html/flag.txt
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
