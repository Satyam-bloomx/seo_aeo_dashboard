"""Reconcile schema drift and enforce one workspace per user

Brings databases created by earlier create_all / migrate_db.py runs in line with the models:
adds tenancy columns, the indexes declared on the models, and a unique constraint on
projects.user_id so concurrent first requests cannot create duplicate workspaces.
Every step is idempotent so it is safe on both fresh and drifted databases.

Revision ID: c3d4e5f6a7b8
Revises: 2ce62ee1d4c3
Create Date: 2026-10-27 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = '2ce62ee1d4c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ADD_COLUMNS = {
    "projects": [sa.Column("user_id", sa.String(length=128), nullable=True)],
    "integrations": [
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("config_json", sa.JSON(), nullable=True),
    ],
    "pages": [sa.Column("title_hash", sa.String(length=64), nullable=True)],
}

INDEXES = [
    ("uq_projects_user_id", "projects", ["user_id"], True),
    ("ix_integrations_user_id", "integrations", ["user_id"], False),
    ("uq_integrations_project_service", "integrations", ["project_id", "integration_type"], True),
    ("ix_integrations_project_type", "integrations", ["project_id", "integration_type"], False),
    ("uq_pages_crawl_url", "pages", ["crawl_id", "url"], True),
    ("ix_pages_crawl_status", "pages", ["crawl_id", "status_code"], False),
    ("ix_pages_crawl_indexability", "pages", ["crawl_id", "indexability"], False),
    ("ix_pages_crawl_depth", "pages", ["crawl_id", "crawl_depth"], False),
    ("ix_links_crawl_source", "links", ["crawl_id", "source_page_id"], False),
    ("ix_links_crawl_dest", "links", ["crawl_id", "destination_url"], False),
    ("ix_images_crawl_page", "images", ["crawl_id", "page_id"], False),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table, columns in ADD_COLUMNS.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)

    inspector = sa.inspect(bind)
    for name, table, cols, unique in INDEXES:
        if table not in tables:
            continue
        table_cols = {c["name"] for c in inspector.get_columns(table)}
        if not set(cols) <= table_cols:
            continue
        existing = {i["name"] for i in inspector.get_indexes(table)}
        existing |= {u["name"] for u in inspector.get_unique_constraints(table) if u.get("name")}
        if name not in existing:
            op.create_index(name, table, cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "projects" in inspector.get_table_names():
        if "uq_projects_user_id" in {i["name"] for i in inspector.get_indexes("projects")}:
            op.drop_index("uq_projects_user_id", table_name="projects")
