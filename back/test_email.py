import smtplib
from email.mime.text import MIMEText
from config import EmailConfig

def send_test_email():
    try:
        msg = MIMEText("Este es un correo de prueba para verificar la configuración del servidor SMTP.")
        msg["From"] = EmailConfig.EMAIL_ADDRESS
        msg["To"] = EmailConfig.ADMIN_EMAIL
        msg["Subject"] = "Prueba de envío"

        with smtplib.SMTP(EmailConfig.SMTP_SERVER, EmailConfig.SMTP_PORT) as server:
            server.starttls()
            server.login(EmailConfig.EMAIL_ADDRESS, EmailConfig.EMAIL_PASSWORD)
            server.send_message(msg)
            print(" Correo enviado correctamente a:", EmailConfig.ADMIN_EMAIL)
    except Exception as e:
        print(" Error al enviar el correo:", str(e))

send_test_email()