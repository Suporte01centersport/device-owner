#!/usr/bin/env bash
#
# backup-db.sh — Backup do banco PostgreSQL do MDM Center
#
# Lê credenciais do arquivo .env (variáveis DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)
# ou da variável DATABASE_URL, se presente.
#
# Uso:
#   ./scripts/backup-db.sh              # execução manual
#   crontab: 0 2 * * * /caminho/scripts/backup-db.sh   # diário às 02:00
#
# Mantém apenas os 7 backups mais recentes.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
ENV_FILE="$PROJECT_DIR/.env"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
MAX_BACKUPS=7

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $*" >&2
}

# ---------------------------------------------------------------------------
# Leitura do .env
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  error "Arquivo .env não encontrado em $ENV_FILE"
  exit 1
fi

# Carrega variáveis do .env (ignora comentários e linhas vazias)
set -a
while IFS='=' read -r key value; do
  # Remove espaços e ignora comentários / linhas vazias
  key="$(echo "$key" | xargs)"
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Remove aspas ao redor do valor
  value="$(echo "$value" | xargs | sed -e "s/^['\"]//;s/['\"]$//")"
  export "$key=$value"
done < "$ENV_FILE"
set +a

# ---------------------------------------------------------------------------
# Resolve credenciais (DATABASE_URL tem prioridade sobre variáveis individuais)
# ---------------------------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ]; then
  # Formato: postgres://user:password@host:port/dbname
  PGUSER="$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
  PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"
  PGHOST="$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')"
  PGPORT="$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')"
  PGDATABASE="$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')"
else
  PGUSER="${DB_USER:-postgres}"
  PGPASSWORD="${DB_PASSWORD:-}"
  PGHOST="${DB_HOST:-localhost}"
  PGPORT="${DB_PORT:-5432}"
  PGDATABASE="${DB_NAME:-mdmweb}"
fi

export PGPASSWORD

# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------
if [ -z "$PGDATABASE" ]; then
  error "Nome do banco de dados não definido. Verifique o .env."
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  error "pg_dump não encontrado no PATH. Instale o PostgreSQL client."
  exit 1
fi

# ---------------------------------------------------------------------------
# Criação do backup
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/${PGDATABASE}_${TIMESTAMP}.sql.gz"

log "Iniciando backup do banco '$PGDATABASE' em $PGHOST:$PGPORT ..."

if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --no-owner --no-acl --format=plain | gzip > "$BACKUP_FILE"; then
  FILESIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  log "Backup concluído com sucesso: $BACKUP_FILE ($FILESIZE)"
else
  error "Falha ao executar pg_dump."
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ---------------------------------------------------------------------------
# Limpeza de backups antigos (mantém os últimos MAX_BACKUPS)
# ---------------------------------------------------------------------------
BACKUP_COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name "${PGDATABASE}_*.sql.gz" -type f | wc -l)"

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  log "Removendo $DELETE_COUNT backup(s) antigo(s) (mantendo os $MAX_BACKUPS mais recentes)..."
  find "$BACKUP_DIR" -maxdepth 1 -name "${PGDATABASE}_*.sql.gz" -type f -printf '%T@ %p\n' \
    | sort -n \
    | head -n "$DELETE_COUNT" \
    | awk '{print $2}' \
    | xargs rm -f
fi

log "Backup finalizado. Total de backups armazenados: $(find "$BACKUP_DIR" -maxdepth 1 -name "${PGDATABASE}_*.sql.gz" -type f | wc -l)"
