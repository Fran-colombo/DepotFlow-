# 📦 Gestión de Depósito - Conkreto SRL

Aplicación web para gestionar productos, movimientos, usuarios y observaciones dentro de un sistema de inventario para depósitos.

---

## 🖥 Tecnologías utilizadas

### Backend

- [FastAPI](https://fastapi.tiangolo.com/)
- SQLite
- JWT Authentication
- SQLAlchemy

### Frontend

- React + Vite
- Bootstrap 5
- Fetch API

---

## 🛠️ Estructura del proyecto

mi-proyecto/
├── back/
├── front/sistema-stock
├── shed_data/
├── docker-compose.yml
├── .gitignore
└── README.md

## 🚀 Cómo correr el proyecto localmente

### 1. Clonar el repositorio

git clone https://github.com/tu-usuario/mi-proyecto.git

cd mi-proyecto

Backend

Requisitos:
-Python 3.10+
-FastAPI
-Uvicorn
-SQLite

Instalación:

cd back
pip install -r requirements.txt

1. Configurar usuario administrador
   Antes de iniciar la app, debes configurar el archivo adminSeed.py para hardcodear tu usuario administrador:

user = User(
name="Admin",
surname="Admin",
email="admin@admin.com",
password=hashed_password,
role=RoleEnum.admin,
status=1
)

2. Levantar el servidor:
   uvicorn main:app --reload

3. Ejecutar el archivo adminSeed.py, con el backend corriendo, ejecutá:
   python adminSeed.py

Esto insertará el usuario administrador.

4. Crear un galpón (shed)
   ⚠️ Importante: el sistema necesita al menos un galpón creado desde el backend para que el frontend funcione correctamente.

http://localhost:8000/docs

💻 Frontend
Requisitos:
Node.js 18+
Vite

Instalación y ejecución:
cd front
npm install
npm run dev
La app estará disponible en:
📍 http://localhost:5173

🔐 Acceso
Iniciá sesión con el usuario administrador que creaste manualmente para comenzar a gestionar productos, galpones, usuarios, historial y más.

🔐 Autenticación

- El sistema utiliza JWT para proteger las rutas.
- Solo los administradores pueden crear, desactivar o visualizar usuarios.
  -Al iniciar sesión, se guarda el token en localStorage.

Contacto
Proyecto desarrollado por Francesco para Conkreto SRL.
