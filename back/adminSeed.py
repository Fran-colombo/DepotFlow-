from database import SessionLocal
from models import User, RoleEnum
from passlib.context import CryptContext

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_admins():
    db = SessionLocal()
    
    # Lista de administradores a crear (nombre, apellido, email, contraseña)
    admins = [
        {
            "name": "admin1",
            "surname": "admin",
            "email": "admin@gmail.com",
            "password": "admin123"
        },
        {
            "name": "admin2",
            "surname": "admin",
            "email": "admin2@gmail.com",
            "password": "admin123"
        }
    ]

    for admin_data in admins:
        existing_admin = db.query(User).filter(User.email == admin_data["email"]).first()
        if existing_admin:
            print(f"Admin con email {admin_data['email']} ya existe")
            continue  # Saltar a la siguiente iteración si ya existe

        admin_user = User(
            name=admin_data["name"],
            surname=admin_data["surname"],
            email=admin_data["email"],
            password=bcrypt_context.hash(admin_data["password"]),
            role=RoleEnum.admin,
            status=1
        )
        db.add(admin_user)
        print(f"Admin {admin_data['email']} creado")

    db.commit()
    db.close()

if __name__ == "__main__":
    seed_admins()  # Cambiado el nombre de la función para reflejar su propósito