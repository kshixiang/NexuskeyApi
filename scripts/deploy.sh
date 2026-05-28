#!/usr/bin/env bash
# Baota / Linux deploy for NexuskeyApi.
# Default: production stack (new-api + PostgreSQL + Redis).
# Optional: --simple for single-container SQLite (trial / dev only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_SIMPLE="${REPO_ROOT}/deploy/docker-compose.simple.yml"
COMPOSE_PROD="${REPO_ROOT}/deploy/docker-compose.prod.yml"
DEFAULT_DEPLOY_DIR="/www/wwwroot/nexuskey-api"

CMD="${1:-install}"
shift || true

DEPLOY_DIR="${DEPLOY_DIR:-}"
HTTP_PORT="3000"
MODE="prod"
MODE_EXPLICIT=0
BUILD_FROM_SOURCE=0
SKIP_CLASSIC=0
LOCAL_IMAGE_TAG="nexuskey-api:local"
LOG_SERVICE=""

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [command] [options]

Commands:
  install   Deploy or refresh stack (default)
  status    Show container status and API health
  update    Pull latest images and restart
  logs      Follow new-api container logs (use: logs --service postgres|redis)
  backup    Archive data/, logs/, and .env from deploy directory (prod: metadata only)

Options:
  --dir PATH       Deploy directory (data, logs, .env live here)
  --port PORT      Host HTTP port (default: 3000)
  --mode MODE      prod (default) | simple
  --simple         Shorthand for --mode simple (SQLite, not for production)
  --build          Build Docker image from this repo (required for your code/UI changes)
  --skip-classic   Skip web/classic build (faster; site uses default theme only)
  -h, --help       Show this help

Environment:
  DEPLOY_DIR       Same as --dir (lower priority than --dir)
  DEPLOY_MODE      prod | simple (lower priority than --mode / --simple)

Examples:
  ./scripts/deploy.sh install
  ./scripts/deploy.sh install --dir /www/wwwroot/nexuskey-api --port 3000
  ./scripts/deploy.sh install --simple --dir /tmp/nexuskey-trial
  ./scripts/deploy.sh install --build --dir /www/wwwroot/nexuskey-api
  ./scripts/deploy.sh update --build --dir /www/wwwroot/nexuskey-api
  ./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api
  ./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api
EOF
}

log() { printf '[deploy] %s\n' "$*"; }
err() { printf '[deploy] ERROR: %s\n' "$*" >&2; }

parse_args() {
  if [ -n "${DEPLOY_MODE:-}" ]; then
    MODE="${DEPLOY_MODE}"
    MODE_EXPLICIT=1
  fi
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        DEPLOY_DIR="${2:?--dir requires a path}"
        shift 2
        ;;
      --port)
        HTTP_PORT="${2:?--port requires a number}"
        shift 2
        ;;
      --mode)
        MODE="${2:?--mode requires prod or simple}"
        MODE_EXPLICIT=1
        shift 2
        ;;
      --simple)
        MODE="simple"
        MODE_EXPLICIT=1
        shift
        ;;
      --build)
        BUILD_FROM_SOURCE=1
        shift
        ;;
      --skip-classic)
        SKIP_CLASSIC=1
        shift
        ;;
      --service)
        LOG_SERVICE="${2:?--service requires a name}"
        shift 2
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage >&2
        exit 1
        ;;
    esac
  done
  case "${MODE}" in
    prod | simple) ;;
    *)
      err "Invalid mode: ${MODE} (use prod or simple)"
      exit 1
      ;;
  esac
}

resolve_deploy_dir() {
  if [ -z "${DEPLOY_DIR}" ]; then
    DEPLOY_DIR="${DEFAULT_DEPLOY_DIR}"
  fi
  mkdir -p "${DEPLOY_DIR}"
  DEPLOY_DIR="$(cd "${DEPLOY_DIR}" && pwd)"
}

load_deploy_mode() {
  if [ "${MODE_EXPLICIT}" -eq 1 ]; then
    return 0
  fi
  local mode_file="${DEPLOY_DIR}/.deploy-mode"
  if [ -f "${mode_file}" ]; then
    MODE="$(tr -d '\r\n' <"${mode_file}")"
    case "${MODE}" in
      prod | simple) ;;
      *)
        err "Invalid ${mode_file} content; use prod or simple"
        exit 1
        ;;
    esac
  fi
}

save_deploy_mode() {
  printf '%s\n' "${MODE}" >"${DEPLOY_DIR}/.deploy-mode"
}

compose_file() {
  if [ "${MODE}" = "simple" ]; then
    printf '%s' "${COMPOSE_SIMPLE}"
  else
    printf '%s' "${COMPOSE_PROD}"
  fi
}

docker_compose() {
  local compose_file
  compose_file="$(compose_file)"
  (
    cd "${DEPLOY_DIR}"
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-nexuskey_api}"
    if docker compose version >/dev/null 2>&1; then
      docker compose --env-file "${DEPLOY_DIR}/.env" -f "${compose_file}" "$@"
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose --env-file "${DEPLOY_DIR}/.env" -f "${compose_file}" "$@"
    else
      err "Docker Compose not found. Install Docker and the compose plugin in Baota Docker."
      exit 1
    fi
  )
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed or not in PATH."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker daemon is not running. Start Docker from Baota panel first."
    exit 1
  fi
  local compose_file
  compose_file="$(compose_file)"
  if [ ! -f "${compose_file}" ]; then
    err "Missing compose file: ${compose_file}"
    err "Run this script from a full repository checkout."
    exit 1
  fi
}

random_hex() {
  local nbytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${nbytes}"
    return
  fi
  if [ -r /dev/urandom ]; then
    head -c "${nbytes}" /dev/urandom | od -An -tx1 | tr -d ' \n'
    return
  fi
  err "Cannot generate random secret (need openssl or /dev/urandom)."
  exit 1
}

read_env_var() {
  local key="$1"
  local file="${DEPLOY_DIR}/.env"
  if [ ! -f "${file}" ]; then
    return 1
  fi
  grep -E "^${key}=" "${file}" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
}

is_placeholder() {
  local value="$1"
  case "${value}" in
    "" | change_me* | CHANGE_ME*) return 0 ;;
    *) return 1 ;;
  esac
}

sed_inplace() {
  local expression="$1"
  local file="$2"
  if sed --version >/dev/null 2>&1; then
    sed -i "${expression}" "${file}"
  else
    sed -i '' "${expression}" "${file}"
  fi
}

set_env_var() {
  local key="$1"
  local value="$2"
  local file="${DEPLOY_DIR}/.env"
  touch "${file}"
  if grep -qE "^${key}=" "${file}" 2>/dev/null; then
    sed_inplace "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >>"${file}"
  fi
}

ensure_secret() {
  local key="$1"
  local nbytes="${2:-32}"
  local current
  current="$(read_env_var "${key}" || true)"
  if is_placeholder "${current}"; then
    local secret
    secret="$(random_hex "${nbytes}")"
    set_env_var "${key}" "${secret}"
    log "Generated ${key}"
  else
    log "Keeping existing ${key}"
  fi
}

write_env_if_missing() {
  local key="$1"
  local value="$2"
  local file="${DEPLOY_DIR}/.env"
  touch "${file}"
  if grep -qE "^${key}=" "${file}" 2>/dev/null; then
    return 0
  fi
  printf '%s=%s\n' "${key}" "${value}" >>"${file}"
}

init_env_from_example() {
  local env_file="${DEPLOY_DIR}/.env"
  if [ -f "${env_file}" ]; then
    return 0
  fi
  log "Creating ${env_file}"
  if [ "${MODE}" = "simple" ]; then
    if [ -f "${REPO_ROOT}/deploy/.env.example" ]; then
      cp "${REPO_ROOT}/deploy/.env.example" "${env_file}"
    else
      touch "${env_file}"
    fi
  else
    if [ -f "${REPO_ROOT}/deploy/.env.prod.example" ]; then
      cp "${REPO_ROOT}/deploy/.env.prod.example" "${env_file}"
    else
      touch "${env_file}"
    fi
  fi
}

ensure_env_simple() {
  init_env_from_example
  mkdir -p "${DEPLOY_DIR}/data" "${DEPLOY_DIR}/logs"
  ensure_secret SESSION_SECRET 32
  write_env_if_missing TZ "Asia/Shanghai"
  write_env_if_missing ERROR_LOG_ENABLED "true"
  write_env_if_missing BATCH_UPDATE_ENABLED "true"
  set_env_var HTTP_PORT "${HTTP_PORT}"
  chmod 600 "${DEPLOY_DIR}/.env" 2>/dev/null || true
}

ensure_env_prod() {
  init_env_from_example
  mkdir -p "${DEPLOY_DIR}/data" "${DEPLOY_DIR}/logs"
  ensure_secret SESSION_SECRET 32
  ensure_secret CRYPTO_SECRET 32
  ensure_secret POSTGRES_PASSWORD 16
  ensure_secret REDIS_PASSWORD 16
  write_env_if_missing POSTGRES_USER "root"
  write_env_if_missing POSTGRES_DB "new-api"
  write_env_if_missing TZ "Asia/Shanghai"
  write_env_if_missing NODE_NAME "new-api-node-1"
  write_env_if_missing ERROR_LOG_ENABLED "true"
  write_env_if_missing BATCH_UPDATE_ENABLED "true"
  set_env_var HTTP_PORT "${HTTP_PORT}"
  chmod 600 "${DEPLOY_DIR}/.env" 2>/dev/null || true
}

ensure_env_file() {
  if [ "${MODE}" = "simple" ]; then
    ensure_env_simple
  else
    ensure_env_prod
  fi
}

build_local_image() {
  if [ ! -f "${REPO_ROOT}/Dockerfile" ]; then
    err "Dockerfile not found at ${REPO_ROOT}/Dockerfile"
    exit 1
  fi
  log "Building image ${LOCAL_IMAGE_TAG} from repository source ..."
  log "Includes frontend (web/default) + backend — may take 5–15 minutes."
  local -a build_args=()
  if [ "${SKIP_CLASSIC}" -eq 1 ]; then
    build_args+=(--build-arg "BUILD_CLASSIC_THEME=0")
    log "BUILD_CLASSIC_THEME=0 (classic theme skipped; use default in admin)"
  fi
  docker build "${build_args[@]}" -t "${LOCAL_IMAGE_TAG}" -f "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}"
  set_env_var DEPLOY_IMAGE "${LOCAL_IMAGE_TAG}"
  log "Set DEPLOY_IMAGE=${LOCAL_IMAGE_TAG} in ${DEPLOY_DIR}/.env"
}

using_local_image() {
  local image
  image="$(read_env_var DEPLOY_IMAGE || true)"
  [ "${image}" = "${LOCAL_IMAGE_TAG}" ]
}

maybe_build_image() {
  if [ "${BUILD_FROM_SOURCE}" -eq 1 ]; then
    build_local_image
    return 0
  fi
  if using_local_image; then
    log "Using existing local image $(read_env_var DEPLOY_IMAGE) (pass --build to rebuild after code changes)"
  else
    log "Using upstream image: $(read_env_var DEPLOY_IMAGE || echo 'calciumion/new-api:latest (compose default)')"
    log "Repo code/UI changes are NOT deployed until you run with --build"
  fi
}

wait_for_health() {
  local port
  port="$(read_env_var HTTP_PORT || echo "${HTTP_PORT}")"
  local url="http://127.0.0.1:${port}/api/status"
  local i
  local max_wait=60
  if [ "${MODE}" = "prod" ]; then
    max_wait=90
  fi
  log "Waiting for API at ${url} (mode=${MODE}, up to ${max_wait}s) ..."
  for i in $(seq 1 "${max_wait}"); do
    if curl -fsS "${url}" 2>/dev/null | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
      log "API is healthy"
      return 0
    fi
    if wget -q -O - "${url}" 2>/dev/null | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
      log "API is healthy"
      return 0
    fi
    sleep 2
  done
  err "Health check timed out. Run: $0 logs --dir ${DEPLOY_DIR}"
  return 1
}

print_post_install() {
  local port
  port="$(read_env_var HTTP_PORT || echo "${HTTP_PORT}")"
  if [ "${MODE}" = "simple" ]; then
    cat <<EOF

--- Deployed (simple / SQLite — not for production) ---
Mode:     simple
URL:      http://<server-ip>:${port}
Data:     ${DEPLOY_DIR}/data
Logs:     ${DEPLOY_DIR}/logs
Env:      ${DEPLOY_DIR}/.env

Next steps:
1. Baota -> Security + cloud SG: allow TCP ${port}
2. Optional HTTPS: reverse proxy to http://127.0.0.1:${port}
   proxy_buffering off; proxy_read_timeout 300s;

Production: re-run with default prod mode (no --simple).
Docs: docs/installation/deploy-tool.md
EOF
    return
  fi

  cat <<EOF

--- Deployed (production: PostgreSQL + Redis) ---
Mode:     prod
URL:      http://<server-ip>:${port}
Data:     ${DEPLOY_DIR}/data
Logs:     ${DEPLOY_DIR}/logs
Env:      ${DEPLOY_DIR}/.env  (chmod 600 — back up securely)

Stack:
  - new-api      (port ${port} -> 3000)
  - PostgreSQL   (volume: pg_data, container: new-api-postgres)
  - Redis        (volume: redis_data, container: new-api-redis)

Next steps:
1. Baota -> Security + cloud security group: allow TCP ${port}
2. Optional HTTPS: reverse proxy to http://127.0.0.1:${port}
   proxy_buffering off; proxy_read_timeout 300s;
3. Backup: ./scripts/deploy.sh backup --dir ${DEPLOY_DIR}
4. Do NOT expose 5432/6379 publicly; DB/Redis are internal to Docker network only

Docs: docs/installation/deploy-tool.md
EOF
}

cmd_install() {
  require_docker
  resolve_deploy_dir
  save_deploy_mode
  log "Mode: ${MODE}"
  log "Deploy directory: ${DEPLOY_DIR}"
  ensure_env_file
  maybe_build_image
  log "Starting containers ..."
  docker_compose up -d
  wait_for_health || true
  print_post_install
}

cmd_status() {
  require_docker
  resolve_deploy_dir
  load_deploy_mode
  log "Mode: ${MODE}"
  log "Deploy directory: ${DEPLOY_DIR}"
  docker_compose ps
  local port
  port="$(read_env_var HTTP_PORT || echo "${HTTP_PORT}")"
  local url="http://127.0.0.1:${port}/api/status"
  if curl -fsS "${url}" 2>/dev/null; then
    echo
  elif wget -q -O - "${url}" 2>/dev/null; then
    echo
  else
    err "Could not reach ${url}"
    exit 1
  fi
}

cmd_update() {
  require_docker
  resolve_deploy_dir
  load_deploy_mode
  log "Mode: ${MODE}"
  log "Deploy directory: ${DEPLOY_DIR}"
  ensure_env_file
  if [ "${BUILD_FROM_SOURCE}" -eq 1 ]; then
    build_local_image
    log "Recreating containers with rebuilt image ..."
    docker_compose up -d --force-recreate
  elif using_local_image; then
    log "Local image mode: skipping pull (use --build after git pull to rebuild)"
    docker_compose up -d --force-recreate
  else
    log "Pulling latest upstream images ..."
    docker_compose pull
    log "Recreating containers ..."
    docker_compose up -d
  fi
  wait_for_health
  log "Update complete"
}

cmd_logs() {
  require_docker
  resolve_deploy_dir
  load_deploy_mode
  local service="${LOG_SERVICE:-new-api}"
  docker_compose logs -f "${service}"
}

cmd_backup() {
  resolve_deploy_dir
  load_deploy_mode
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local out="${DEPLOY_DIR}/backups/nexuskey-backup-${stamp}.tar.gz"
  mkdir -p "${DEPLOY_DIR}/backups"
  log "Creating ${out}"
  tar -czf "${out}" -C "${DEPLOY_DIR}" data logs .env 2>/dev/null || tar -czf "${out}" -C "${DEPLOY_DIR}" data .env
  log "Backup saved ($(du -h "${out}" | cut -f1))"
  if [ "${MODE}" = "prod" ]; then
    log "PostgreSQL/Redis data live in Docker volumes (pg_data, redis_data)."
    log "Volume backup example:"
    log "  docker run --rm -v nexuskey_api_pg_data:/v -v ${DEPLOY_DIR}/backups:/b alpine tar czf /b/pg_data-${stamp}.tar.gz -C /v ."
  fi
}

case "${CMD}" in
  install) parse_args "$@"; cmd_install ;;
  status) parse_args "$@"; cmd_status ;;
  update) parse_args "$@"; cmd_update ;;
  logs) parse_args "$@"; cmd_logs ;;
  backup) parse_args "$@"; cmd_backup ;;
  -h | --help | help)
    usage
    ;;
  *)
    err "Unknown command: ${CMD}"
    usage >&2
    exit 1
    ;;
esac
