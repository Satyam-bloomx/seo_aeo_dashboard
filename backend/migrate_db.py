import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "seo_audit.db")

def run_migrations():
    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}. Creating new database...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Configure SQLite PRAGMAs
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("PRAGMA busy_timeout = 30000;")
    
    tables = [t[0] for t in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    # 2. Integrations schema migrations
    if "integrations" in tables:
        columns = [c[1] for c in cursor.execute("PRAGMA table_info(integrations)").fetchall()]
        if "api_key" not in columns:
            print("Adding api_key column to integrations table...")
            cursor.execute("ALTER TABLE integrations ADD COLUMN api_key TEXT")
        if "config_json" not in columns:
            print("Adding config_json column to integrations table...")
            cursor.execute("ALTER TABLE integrations ADD COLUMN config_json JSON")
            
        print("Creating indexes on integrations...")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_project_service ON integrations(project_id, integration_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_integrations_project_type ON integrations(project_id, integration_type)")

    # 3. Pages schema indexes
    if "pages" in tables:
        print("Creating indexes on pages...")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_pages_crawl_url ON pages(crawl_id, url)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_pages_crawl_url ON pages(crawl_id, url)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_pages_crawl_status ON pages(crawl_id, status_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_pages_crawl_indexability ON pages(crawl_id, indexability)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_pages_crawl_depth ON pages(crawl_id, crawl_depth)")

    # 4. Links schema indexes
    if "links" in tables:
        print("Creating indexes on links...")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_links_crawl_source ON links(crawl_id, source_page_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_links_crawl_dest ON links(crawl_id, destination_url)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_links_crawl_internal ON links(crawl_id, is_internal)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_links_crawl_type ON links(crawl_id, link_type)")

    # 5. Images schema indexes
    if "images" in tables:
        print("Creating indexes on images...")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_images_crawl_page ON images(crawl_id, page_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_images_crawl_url ON images(crawl_id, url)")

    conn.commit()
    conn.close()
    print("Database schema migration and index creation completed successfully!")

if __name__ == "__main__":
    run_migrations()
