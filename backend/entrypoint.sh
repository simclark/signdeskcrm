#!/bin/bash
set -e

python <<'PY'
import os
import time

import pymysql

host = os.getenv("MYSQL_HOST", "mysql")
user = os.getenv("MYSQL_USER", "signdesk")
password = os.getenv("MYSQL_PASSWORD", "signdesk")
database = os.getenv("MYSQL_DATABASE", "signdesk")
port = int(os.getenv("MYSQL_PORT", "3306"))
ssl_ca = os.getenv("MYSQL_SSL_CA", "").strip()
ssl_required = os.getenv("MYSQL_SSL_REQUIRED", "").lower() in ("1", "true", "yes")

connect_kwargs = {
    "host": host,
    "user": user,
    "password": password,
    "database": database,
    "port": port,
}
if ssl_ca:
    connect_kwargs["ssl"] = {"ca": ssl_ca}
elif ssl_required:
    connect_kwargs["ssl"] = {}

for i in range(60):
    try:
        conn = pymysql.connect(**connect_kwargs)
        conn.close()
        print("MySQL is ready")
        break
    except Exception as exc:
        print(f"Waiting for MySQL ({i}): {exc}")
        time.sleep(2)
else:
    raise SystemExit("MySQL not available")
PY

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput || true
fi

exec "$@"
