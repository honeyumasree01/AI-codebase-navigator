import os

from celery import Celery

celery_app = Celery(
    "tasks",
    broker=os.environ.get("REDIS_URL"),
    backend=os.environ.get("REDIS_URL"),
)
celery_app.conf.update(
    worker_concurrency=1,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=10,
    worker_max_memory_per_child=400000,
)


@celery_app.task(bind=True, max_retries=3, name="ingest_repo")
def ingest_repo_task(self, repo_id: str, github_url: str) -> str:
    from db import queries
    from ingestion.ingester import ingest_repo_sync

    queries.db_init()
    ingest_repo_sync(repo_id, github_url)
    return "ok"
