# Gestión de Depósito - Conkreto SRL

Aplicación web para gestionar productos, movimientos, usuarios y observaciones dentro de un sistema de inventario para depósitos.

## Tecnologías

- **Backend:** FastAPI, SQLite, JWT, SQLAlchemy
- **Frontend:** React + Vite, Bootstrap 5

## Estructura

```
gestorInventarioGalpon/
├── back/
├── front/sistema-stock/
├── shed_data/          # SQLite persistente (Docker volume)
├── docker-compose.yml
├── .env.example
└── README.md
```

## Desarrollo local

### Backend

```bash
cd back
pip install -r requirements.txt
cp .env.example .env   # editar SECRET_KEY y mail si aplica
uvicorn main:app --reload
```

La DB por defecto queda en `shed_data/shed.db` (relativa al repo).

Crear admin con `adminSeed.py` (local) y al menos un depósito desde `/docs`.

### Frontend

```bash
cd front/sistema-stock
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

App en http://localhost:5173

## Deploy con Docker (recomendado)

En un VPS con Docker instalado:

1. Copiá variables de entorno:

```bash
cp .env.example .env
# Editá SECRET_KEY (obligatorio en producción)
```

2. Levantá:

```bash
docker compose up -d --build
```

3. Accedé:
   - App: `http://TU_IP` (o tu dominio en el puerto 80)
   - API directa: `http://TU_IP:8000` / docs en `/docs`
   - El front llama al API vía `/api` (nginx → backend)

4. Primer uso:
   - El admin se crea solo si en `.env` están `ADMIN_USER_EMAIL` y `ADMIN_USER_PASSWORD`
   - Crear al menos un depósito y zonas

### Variables importantes

| Variable | Uso |
|----------|-----|
| `SECRET_KEY` | Firma JWT |
| `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` | Admin creado al arrancar (si no existe) |
| `VITE_API_URL` | Default `/api` (proxy nginx). Si el front está en otro dominio, usá la URL pública del API |
| `DB_PATH` | Ruta SQLite (Docker: `/app/shed_data/shed.db`) |
| `ALLOWED_ORIGINS` | CORS (`*` o lista) |
| `EMAIL_*` / `SMTP_*` | Notificaciones (opcional) |

### HTTPS

Poné un reverse proxy (Caddy / nginx / Traefik) delante del puerto 80 con certificado Let's Encrypt.

### Backup

Copiá periódicamente la carpeta `shed_data/` (contiene `shed.db`).

## Contacto

Proyecto desarrollado por Francesco para Conkreto SRL.
