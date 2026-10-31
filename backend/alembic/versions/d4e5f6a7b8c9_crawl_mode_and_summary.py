"""Add crawl mode (site/page) and crawl-level summary JSON

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-27 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("crawls")}
    if "mode" not in existing:
        op.add_column("crawls", sa.Column("mode", sa.String(length=10), nullable=False, server_default="site"))
    if "summary" not in existing:
        op.add_column("crawls", sa.Column("summary", sa.JSON(), nullable=True))
    indexes = {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("crawls")}
    if "ix_crawls_project_mode" not in indexes:
        op.create_index("ix_crawls_project_mode", "crawls", ["project_id", "mode"])


def downgrade() -> None:
    op.drop_index("ix_crawls_project_mode", table_name="crawls")
    op.drop_column("crawls", "summary")
    op.drop_column("crawls", "mode")
