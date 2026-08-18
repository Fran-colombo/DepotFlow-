# Entorno DEMO — despliegue aislado

Este directorio contiene **solo** la configuración del entorno de demostración. No modifica ni comparte datos con producción.

## Separación prod vs demo

| | Producción | DEMO |
|---|------------|------|
| Compose | `docker-compose.yml` | `docker-compose.demo.yml` |
| Proyecto Docker | (default) | `depotflow-demo` |
| Contenedores | `backend`, `frontend` | `demo-backend`, `demo-frontend` |
| Base de datos | `shed_data/shed.db` | `demo/shed_data_demo/shed.db` |
| Env | `.env` | `demo/.env.demo` |
| Puertos host | `80`, `8000` | `8082`, `8001` |
| Código app | `back/`, `front/` | **Mismo código**, distinto build/env |

## Primer despliegue

Desde la raíz del repo:

```bash
cp demo/.env.demo.example demo/.env.demo
# Opcional: cambiar SECRET_KEY en demo/.env.demo (usar uno distinto al de producción)

docker compose -f docker-compose.demo.yml -p depotflow-demo up -d --build
```

- Web demo: http://localhost:8082  
- API demo: http://localhost:8001/docs  

En un VPS con producción ya corriendo, mapeá un **puerto público nuevo** hacia el `8082` interno del host (el contenedor sigue escuchando en el puerto `80` interno).

## Credenciales demo

| Rol | Email | Password |
|-----|-------|----------|
| Admin | demo.admin@example.com | Demo123! |
| Usuario | demo.user@example.com | Demo123! |

Ver también [RECRUITER_GUIDE.md](./RECRUITER_GUIDE.md) para reclutadores.

## Reset del demo

Restaura la base ficticia original (solo afecta `demo/shed_data_demo/`):

```bash
bash demo/scripts/reset_demo.sh
```

O manualmente:

```bash
docker compose -f docker-compose.demo.yml -p depotflow-demo down
rm -f demo/shed_data_demo/shed.db
DEMO_RESET=1 docker compose -f docker-compose.demo.yml -p depotflow-demo up -d --build
```

## Seed idempotente

Al arrancar, `demo-backend` ejecuta `demo/seed/seed_demo_data.py` antes de uvicorn.

- Si `demo.admin@example.com` ya existe → no vuelve a poblar.
- Con `DEMO_RESET=1` → limpia tablas demo y re-seedea.

## Banner DEMO en la UI

El frontend demo se construye con [`demo/docker/Dockerfile.frontend.demo`](docker/Dockerfile.frontend.demo), que inyecta el banner **solo dentro de la imagen Docker**. Los archivos en `front/sistema-stock/` no se modifican.

## Validación

- Producción sigue con `docker compose up` (sin `-f docker-compose.demo.yml`).
- Demo nunca monta `./shed_data` de producción.
- No hay endpoints ni flags demo en el código de producción.
