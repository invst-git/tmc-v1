import json
from typing import Any, Dict, List, Optional, Tuple
from db import get_conn

def _ensure_chat_tables(cur) -> None:
    cur.execute("""
    CREATE TABLE IF NOT EXISTS public.chats (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL,
      title text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS public.chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('user','assistant','system')),
      content text NOT NULL,
      tags jsonb,
      created_at timestamptz DEFAULT now()
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chats_vendor_id ON public.chats(vendor_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON public.chat_messages(chat_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_tags ON public.chat_messages USING GIN (tags jsonb_path_ops);")

def create_chat(vendor_id: str, title: Optional[str] = None) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_chat_tables(cur)
            cur.execute(
                """
                INSERT INTO chats(vendor_id, title)
                VALUES (%s, %s)
                RETURNING id
                """,
                (vendor_id, title)
            )
            return str(cur.fetchone()[0])

def list_chats_for_vendor(vendor_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM chats
                WHERE vendor_id = %s
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (vendor_id, limit)
            )
            rows = cur.fetchall()
            return [
                {
                    "id": str(r[0]),
                    "title": r[1] or "",
                    "createdAt": r[2].isoformat() if r[2] else None,
                    "updatedAt": r[3].isoformat() if r[3] else None,
                }
                for r in rows
            ]

def add_message(chat_id: str, role: str, content: str, tags: Optional[Dict[str, Any]] = None) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_chat_tables(cur)
            cur.execute(
                """
                INSERT INTO chat_messages(chat_id, role, content, tags)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (chat_id, role, content, json.dumps(tags or {}))
            )
            msg_id = str(cur.fetchone()[0])
            # bump chat.updated_at
            cur.execute("UPDATE chats SET updated_at = now() WHERE id=%s", (chat_id,))
            return msg_id

def list_messages(chat_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_chat_tables(cur)
            if before:
                cur.execute(
                    """
                    SELECT id, role, content, tags, created_at
                    FROM chat_messages
                    WHERE chat_id = %s AND id < %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (chat_id, before, limit)
                )
            else:
                cur.execute(
                    """
                    SELECT id, role, content, tags, created_at
                    FROM chat_messages
                    WHERE chat_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (chat_id, limit)
                )
            rows = cur.fetchall()
            items = []
            for r in reversed(rows):
                tags = r[3]
                try:
                    if isinstance(tags, str):
                        tags = json.loads(tags)
                except Exception:
                    tags = {}
                items.append({
                    "id": str(r[0]),
                    "role": r[1],
                    "content": r[2],
                    "tags": tags or {},
                    "createdAt": r[4].isoformat() if r[4] else None,
                })
            return items

def get_chat_vendor(chat_id: str) -> Optional[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT vendor_id FROM chats WHERE id=%s", (chat_id,))
            row = cur.fetchone()
            return str(row[0]) if row else None

def update_chat_title(chat_id: str, title: str) -> None:
    if not title:
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_chat_tables(cur)
            # Override empty titles and generic defaults like "Chat ..."
            cur.execute(
                """
                UPDATE chats
                SET title = %s, updated_at = now()
                WHERE id = %s AND (
                    title IS NULL OR title = '' OR title ILIKE 'chat%%'
                )
                """,
                (title, chat_id)
            )
