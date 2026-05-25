import psycopg2, sys

db_url = "postgresql://postgres:BCvWQGXKczxnPSEVNoUOGWWdcmaFMmbU@yamabiko.proxy.rlwy.net:20231/railway"
redis_url = "redis://default:aChvrVLjvQWIDKbxGGVKHGikQsHAnKzi@yamabiko.proxy.rlwy.net:14716"

# --- Test PostgreSQL ---
print("Testing PostgreSQL connection...")
try:
    conn = psycopg2.connect(db_url, connect_timeout=10)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    ver = cur.fetchone()[0]
    print(f"  PG VERSION : {ver[:50]}")
    cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
    row = cur.fetchone()
    if row:
        print(f"  PGVECTOR   : {row[0]} v{row[1]} -- ACTIVE")
    else:
        print("  PGVECTOR   : NOT FOUND -- run CREATE EXTENSION IF NOT EXISTS vector;")
    conn.close()
    print("  STATUS     : PASS")
except Exception as e:
    print(f"  STATUS     : FAIL -- {e}")
    sys.exit(1)

# --- Test Redis ---
print("Testing Redis connection...")
try:
    import redis
    r = redis.from_url(redis_url, socket_connect_timeout=10)
    pong = r.ping()
    print(f"  PING       : {pong}")
    print(f"  STATUS     : PASS")
except Exception as e:
    print(f"  STATUS     : FAIL -- {e}")
    sys.exit(1)

print("\nAll connection tests PASSED.")
