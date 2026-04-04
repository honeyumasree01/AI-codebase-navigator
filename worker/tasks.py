from celery import Celery

from utils.config import get_settings

s = get_settings()
celery_app = Celery(
    "navigator",
    broker=s.redis_url,
    backend=s.redis_url,
)
celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])


@celery_app.task(bind=True, max_retries=3, name="ingest_repo")
def ingest_repo_task(self, repo_id: str, github_url: str) -> str:
    from db import queries
    from ingestion.ingester import ingest_repo_sync

    queries.db_init()
    ingest_repo_sync(repo_id, github_url)
    return "ok"
