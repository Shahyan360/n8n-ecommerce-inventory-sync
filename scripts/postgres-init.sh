#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" -v n8n_password="$N8N_DB_PASSWORD" <<'SQL'
CREATE USER commerce_app PASSWORD :'app_password';
CREATE USER n8n_app PASSWORD :'n8n_password';
CREATE DATABASE n8n OWNER n8n_app;
CREATE DATABASE commerce_test OWNER commerce_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
