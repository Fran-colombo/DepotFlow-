# Guía para el VPS — conkreto-gestiondeposito

**Dominio:** https://conkreto-gestiondeposito.duckdns.org  
**App:** Gestión de Depósito (este repo: backend FastAPI + frontend React/nginx + Caddy compartido en el VPS).  
**Objetivo:** que abra por HTTPS sin errores de CORS, certificado ni puertos.

## Antes de tocar nada (importante)

En este servidor ya hay otras apps (ej. portfolio, quincenas). **No borres ni reemplaces el Caddyfile entero:** sumá el dominio nuevo.

La máquina suele estar detrás de NAT del proveedor: el 80/443 públicos a veces no llegan a la VM. Por eso el HTTPS se saca con **DuckDNS + DNS-01**, no esperando que Let’s Encrypt pegue por HTTP al puerto 80.

**Nunca borres la carpeta `shed_data/` al actualizar:** ahí está la base SQLite (`shed.db`).

---

## 1) DuckDNS

1. Entrá a https://www.duckdns.org con la cuenta de Conkreto.
2. Creá el subdomain: `conkreto-gestiondeposito`.
3. Que apunte a la **IP pública del VPS** (la misma que usan los otros `conkreto-*.duckdns.org`).
4. Copiá el token (lo vas a pegar en el `.env` del **Caddy del VPS** como `DUCKDNS_TOKEN`).

Si el DNS no apunta a esa IP, el dominio nunca va a resolver bien.

---

## 2) NAT / panel del proveedor (lo que más falla)

En el panel de port forwarding / NAT:

| Público | Interno (VM) | Para qué |
|---------|--------------|----------|
| 443 → | 443 | Ideal: HTTPS limpio |
| 80 → | 80 | Útil, pero el cert no depende de esto |
| Si 443 está ocupado: 10443 → 443 (ejemplo) | Entrá con `:10443` en la URL |

**Regla:** si la gente entra con puerto en la URL (`:10443`), ese mismo origen tiene que estar en `ALLOWED_ORIGINS`. Si no, el login/API falla aunque la web “abra”.

También en la VM:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8084/tcp
# si usás puerto alto, abrilo también, ej:
# sudo ufw allow 10443/tcp
sudo ufw enable
```

---

## 3) Código en el VPS

Con Docker instalado (`docker` + `docker compose`):

```bash
cd /ruta/donde/esté/el/proyecto   # ej. ~/gestorInventarioGalpon
# si es git:
git pull
```

Si es la primera vez: clonar o copiar el proyecto y entrar a esa carpeta.

---

## 4) Archivo `.env` (obligatorio)

```bash
cp .env.example .env
nano .env
```

Dejá algo así (valores de ejemplo; **cambiá secretos**):

```env
SECRET_KEY=una-clave-larga-y-random
VITE_API_URL=/api

# CORS: tiene que coincidir con la URL real del navegador
# Si el sitio abre SIN puerto raro:
ALLOWED_ORIGINS=https://conkreto-gestiondeposito.duckdns.org

# Si el sitio abre CON puerto (ej. 10443), USÁ ESTO en vez de lo de arriba:
# ALLOWED_ORIGINS=https://conkreto-gestiondeposito.duckdns.org:10443

ADMIN_USER_EMAIL=admin@conkreto.com
ADMIN_USER_PASSWORD=una-password-fuerte
ADMIN_USER_NAME=Admin
ADMIN_USER_SURNAME=Sistema

# En Docker la DB ya va a /app/shed_data/shed.db (volumen ./shed_data)
# No pongas rutas locales tipo ./data/...

# Mails (opcional; si no hay password, la web anda igual)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
EMAIL_ADDRESS=
EMAIL_PASSWORD=
ADMIN_EMAIL=
NOTIFICATION_THRESHOLD_DAYS=7

WHATSAPP_API_KEY=cambia-esta-clave-whatsapp
TELEGRAM_BOT_TOKEN=
```

**Errores típicos acá:**

- `ALLOWED_ORIGINS` sin `https://` o sin el **puerto real** → el front carga y la API rechaza.
- Borrar o no montar `shed_data/` → se pierde el inventario.
- `DUCKDNS_TOKEN` vacío en el **Caddy del VPS** → no saca certificado (eso no va en el `.env` de esta app; va donde corre Caddy).

---

## 5) Caddyfile — agregar el dominio (sin borrar lo demás)

Arriba del archivo del **Caddy compartido** del VPS ya tiene que estar algo como:

```caddy
{
	acme_dns duckdns {env.DUCKDNS_TOKEN}
	auto_https disable_redirects
}
```

No actives redirect HTTP→HTTPS si el 443 público no llega limpio a la VM.

**Agregá al final** (o junto a los otros sitios), sin tocar quincenas/portfolio:

```caddy
http://conkreto-gestiondeposito.duckdns.org {
	reverse_proxy frontend:80
}

conkreto-gestiondeposito.duckdns.org {
	reverse_proxy frontend:80
}
```

Este proyecto manda todo al contenedor `frontend`; el nginx del front ya reenvía `/api/` al `backend:8000`. **No hace falta** armar `handle /api*` como en quincenas.

### Red Docker (si Caddy está en otro compose)

Caddy tiene que alcanzar el contenedor `frontend`. Opciones típicas:

- Poner Caddy y esta app en la **misma red** Docker, o
- Usar `reverse_proxy host.docker.internal:8084` / IP de la VM + puerto publicado `8084:80`.

Si el front se publica en el host como `8084:80` (ver `Docker-compose.yml`), desde un Caddy en otra red podés usar:

```caddy
conkreto-gestiondeposito.duckdns.org {
	reverse_proxy 127.0.0.1:8084
}
```

(ajustá según cómo esté cableado el resto de apps del VPS).

---

## 6) Levantar

Desde la carpeta del proyecto:

```bash
docker compose -f Docker-compose.yml up -d --build
docker compose -f Docker-compose.yml ps
curl -sI http://localhost:8084/
curl -sI http://localhost:8084/api/
docker compose -f Docker-compose.yml logs -f backend frontend
```

En los logs de **Caddy del VPS** buscá que el certificado de `conkreto-gestiondeposito.duckdns.org` se obtenga sin error.

Containers de esta app que tienen que estar up:

- `depotflow-backend`
- `depotflow-frontend`
- (opcional) `depotflow-n8n` si usan el bot

Los nombres van con prefijo `depotflow-` para no chocar con otras apps del mismo VPS (ej. otro `/n8n`).

---

## 7) Cómo probar que quedó bien

1. Abrí en el navegador:  
   https://conkreto-gestiondeposito.duckdns.org  
   (o con `:10443` si ese es el mapeo).
2. Tiene que cargar el sitio (candado HTTPS OK).
3. Login con el mail/password del `.env` (`ADMIN_USER_*`) la primera vez; después el user ya está en la DB.
4. Si la página abre pero el login o las listas fallan → casi seguro **CORS** (`ALLOWED_ORIGINS`, punto 4).

---

## 8) Actualizar después (sin romper datos)

```bash
cd /ruta/del/proyecto
git pull
docker compose -f Docker-compose.yml up -d --build
```

**No hagas** `rm -rf shed_data/` salvo que quieran borrar todo a propósito.

Backup: copiá periódicamente `shed_data/` (sobre todo `shed.db`).

---

## Checklist anti-errores

- [ ] DuckDNS `conkreto-gestiondeposito` → IP correcta del VPS.
- [ ] NAT: 443→443 (o alto→443) hasta esta VM.
- [ ] Firewall con esos puertos abiertos.
- [ ] `.env` con `SECRET_KEY`, `ALLOWED_ORIGINS` igual a la URL real, admin bootstrap.
- [ ] Caddyfile: bloques del dominio **sumados**, no pisando otros.
- [ ] `auto_https disable_redirects` se deja.
- [ ] `docker compose up -d --build` y revisar logs de Caddy + `backend`/`frontend`.
- [ ] Probar sitio + login.
- [ ] **No borrar `shed_data/`.**

---

## Si algo falla — dónde mirar

| Síntoma | Causa más común |
|---------|-----------------|
| No resuelve el nombre | DuckDNS / IP mal |
| Timeout / no conecta | NAT o firewall |
| Certificado inválido / HTTPS caído | `DUCKDNS_TOKEN` en Caddy o Caddy sin rebuild |
| Página OK, API/login rotos | `ALLOWED_ORIGINS` no coincide con la URL (sobre todo el **puerto**) |
| Pierde inventario al rebuild | Borraron `shed_data/` o no montaron el volumen |
| Quincenas/otra app se rompió | Pisaron el Caddyfile entero |

Con eso el depósito puede quedar en `conkreto-gestiondeposito` igual que el resto de los dominios Conkreto en ese VPS.
