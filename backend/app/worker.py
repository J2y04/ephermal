"""
Celery worker — background tasks for Ephermal.

Handles:
- Polling Higgsfield job status and saving completed creatives
- Syncing analytics from Meta/Google every hour
- Daily campaign optimization trigger
"""
from celery import Celery
from app.config import settings

celery_app = Celery(
    "ephermal",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "sync-analytics-hourly": {
            "task": "app.tasks.sync_all_analytics",
            "schedule": 3600.0,
        },
        "optimize-campaigns-daily": {
            "task": "app.tasks.optimize_all_campaigns",
            "schedule": 86400.0,
        },
        "poll-higgsfield-jobs": {
            "task": "app.tasks.poll_pending_generations",
            "schedule": 60.0,
        },
    },
)
