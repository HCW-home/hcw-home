# Use the official Python runtime image
FROM python:3.13 as builder

RUN mkdir /app
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1

ENV PYTHONUNBUFFERED=1 

RUN pip install --upgrade pip 
COPY requirements.txt  /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app/
# RUN python manage.py collectstatic

FROM python:3.13 as api

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app/ /app/
WORKDIR /app
EXPOSE 8000

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "core.asgi:application"]


FROM docker.io/nginxinc/nginx-unprivileged:1.28-bookworm as admin

COPY --from=builder /app/statics/ /usr/share/nginx/html/
COPY nginx /etc/nginx/templates/default.conf.template