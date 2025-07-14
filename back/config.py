import os
from dotenv import load_dotenv

load_dotenv()  

class EmailConfig:
    SMTP_SERVER = os.getenv("SMTP_SERVER")
    SMTP_PORT = int(os.getenv("SMTP_PORT"))
    EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
    EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    NOTIFICATION_THRESHOLD_DAYS = float(os.getenv("NOTIFICATION_THRESHOLD_DAYS"))
