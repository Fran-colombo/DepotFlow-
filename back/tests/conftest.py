import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TMP = Path(tempfile.mkdtemp())
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP / 'test.db').as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key-invariants-32chars"
os.environ["ENV"] = "development"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["WHATSAPP_API_KEY"] = "test-whatsapp-key"
os.environ["DEBUG"] = "false"
os.environ.pop("TELEGRAM_WEBHOOK_URL", None)
