from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from apps.common.health import run_health_checks


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class HealthChecksTests(SimpleTestCase):
    def test_eager_celery_reports_ok(self):
        payload = run_health_checks(include_celery=True)
        self.assertEqual(payload["checks"]["celery"], "ok (eager)")

    def test_public_health_endpoint(self):
        client = APIClient()
        res = client.get("/api/health/")
        self.assertIn(res.status_code, (200, 503))
        body = res.json()
        self.assertIn("checks", body)
        self.assertIn("database", body["checks"])
        self.assertIn("redis", body["checks"])
        self.assertNotIn("celery", body["checks"])
