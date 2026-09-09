import sqlite3
conn = sqlite3.connect('seo_audit.db')
cursor = conn.cursor()
cursor.execute("SELECT url, status_code, indexability, indexability_status FROM pages ORDER BY id DESC LIMIT 1")
print(cursor.fetchone())
conn.close()
