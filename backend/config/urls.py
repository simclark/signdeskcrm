from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.contacts.views import CompanyViewSet, ContactViewSet
from apps.documents.views import DocumentViewSet, TemplateViewSet
from apps.envelopes.views import DashboardViewSet, EnvelopeViewSet
from apps.signing.views import (
    SigningConsentView,
    SigningDeclineView,
    SigningFieldCompleteView,
    SigningSessionView,
    SigningSubmitView,
)
from apps.tenants.views import (
    MembershipListView,
    SignupView,
    SuggestSlugView,
    SlugCheckView,
    TenantMeView,
    TenantSettingsView,
    ThrottledTokenObtainPairView,
)
from django.http import JsonResponse


def health(_request):
    return JsonResponse({"status": "ok", "service": "signdesk-api"})


router = DefaultRouter()
router.register(r"companies", CompanyViewSet, basename="company")
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"documents", DocumentViewSet, basename="document")
router.register(r"templates", TemplateViewSet, basename="template")
router.register(r"envelopes", EnvelopeViewSet, basename="envelope")
router.register(r"dashboard", DashboardViewSet, basename="dashboard")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/signup/", SignupView.as_view(), name="signup"),
    path("api/auth/login/", ThrottledTokenObtainPairView.as_view(), name="login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/slug-check/", SlugCheckView.as_view(), name="slug-check"),
    path("api/auth/suggest-slug/", SuggestSlugView.as_view(), name="suggest-slug"),
    path("api/tenant/me/", TenantMeView.as_view(), name="tenant-me"),
    path("api/tenant/settings/", TenantSettingsView.as_view(), name="tenant-settings"),
    path("api/tenant/members/", MembershipListView.as_view(), name="tenant-members"),
    path("api/sign/<str:token>/", SigningSessionView.as_view(), name="sign-session"),
    path("api/sign/<str:token>/consent/", SigningConsentView.as_view(), name="sign-consent"),
    path(
        "api/sign/<str:token>/fields/<int:field_id>/",
        SigningFieldCompleteView.as_view(),
        name="sign-field",
    ),
    path("api/sign/<str:token>/submit/", SigningSubmitView.as_view(), name="sign-submit"),
    path("api/sign/<str:token>/decline/", SigningDeclineView.as_view(), name="sign-decline"),
    path("api/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
