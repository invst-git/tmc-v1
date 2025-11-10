import os
from dotenv import load_dotenv
import psycopg

load_dotenv()
DB_URL=os.getenv("DATABASE_URL")

def get_conn():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg.connect(DB_URL)
