import os
from dotenv import load_dotenv

load_dotenv()


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


class EmailConfig:
    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT = _env_int("SMTP_PORT", 587)
    EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS", "")
    EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
    NOTIFICATION_THRESHOLD_DAYS = _env_float("NOTIFICATION_THRESHOLD_DAYS", 7.0)

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.EMAIL_ADDRESS and cls.EMAIL_PASSWORD and cls.ADMIN_EMAIL and cls.SMTP_SERVER)
