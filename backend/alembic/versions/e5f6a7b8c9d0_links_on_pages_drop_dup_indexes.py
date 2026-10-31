"""Store links as JSON on pages and drop indexes that duplicate the primary key

Every link used to be one row in `links` (~110 bytes of data but ~1.7 KB of indexes). Links are now kept
as compact JSON lists on the page row: `outlinks` (the page's links) and `inlinks_sample` (up to 100
pages linking to it). The `links` table stays for now (no longer read or written) and is dropped in a
later migration once the new path is proven. Existing crawls keep their `links` rows but have no
`outlinks`, so their link data is empty until the next crawl replaces them.

Also drops `ix_<table>_id` indexes (the primary key already indexes `id`) and `ix_links_destination_url`
(covered by `ix_links_crawl_dest`). Idempotent: safe on fresh and drifted databases (PostgreSQL).

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index, table, column) - single-column duplicates of the primary key / of a composite index.
DROPPED_INDEXES = [
    ("ix_links_id", "links", "id"),
    ("ix_pages_id", "pages", "id"),
    ("ix_images_id", "images", "id"),
    ("ix_integrations_id", "integrations", "id"),
    ("ix_projects_id", "projects", "id"),
    ("ix_crawls_id", "crawls", "id"),
    ("ix_links_destination_url", "links", "destination_url"),
]


def upgrade() -> None:
    op.execute("ALTER TABLE pages ADD COLUMN IF NOT EXISTS outlinks JSONB")
    op.execute("ALTER TABLE pages ADD COLUMN IF NOT EXISTS inlinks_sample JSONB")
    for index, _table, _column in DROPPED_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {index}")


def downgrade() -> None:
    # Link data written to pages.outlinks / inlinks_sample is discarded (the links table is not backfilled).
    for index, table, column in DROPPED_INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {index} ON {table} ({column})")
    op.execute("ALTER TABLE pages DROP COLUMN IF EXISTS inlinks_sample")
    op.execute("ALTER TABLE pages DROP COLUMN IF EXISTS outlinks")
