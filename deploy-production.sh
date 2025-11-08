#!/bin/bash
# Wrapper para executar o deploy diretamente da raiz do projeto.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/mdm-frontend/scripts/deploy"
./deploy-production.sh "$@"

