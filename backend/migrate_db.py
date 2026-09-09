import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "seo_audit.db")

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check tables
    tables = [t[0] for t in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if "integrations" in tables:
        columns = [c[1] for c in cursor.execute("PRAGMA table_info(integrations)").fetchall()]
        
        if "api_key" not in columns:
            print("Adding api_key column to integrations table...")
            cursor.execute("ALTER TABLE integrations ADD COLUMN api_key TEXT")
            
        if "config_json" not in columns:
            print("Adding config_json column to integrations table...")
            cursor.execute("ALTER TABLE integrations ADD COLUMN config_json JSON")
            
        conn.commit()
        print("Database schema migration successful!")
    conn.close()
else:
    print("Database file not created yet.")
