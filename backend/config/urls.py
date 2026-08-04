from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.public_views import LogoutView, PublicConfigView
from apps.accounts.views import (
    ChangePasswordView,
    PasswordResetConfirmView,
    PasswordResetDetailView,
    PasswordResetRequestView,
    ProfileView,
)
from apps.common.health import run_health_checks
from apps.common.media import ProtectedMediaView
from apps.contacts.views import (
    CompanyViewSet,
    ContactViewSet,
    FollowUpPlanEnrollmentViewSet,
    FollowUpPlanViewSet,
    FollowUpTaskViewSet,
    ListingViewSet,
)
from apps.documents.views import DocumentViewSet, TemplateViewSet
from apps.envelopes.views import DashboardViewSet, EnvelopeViewSet
from apps.signing.views import (
    SigningConsentView,
    SigningDeclineView,
    SigningDocumentView,
    SigningDownloadView,
    SigningFieldCompleteView,
    SigningSessionView,
    SigningSubmitView,
)
from apps.tenants.platform_views import (
    PlatformDemoResetView,
    PlatformHealthView,
    PlatformInvitationResendView,
    PlatformInvitationRevokeView,
    PlatformInviteOwnerView,
    PlatformMeView,
    PlatformMediaOrphansView,
    PlatformOpsEventListView,
    PlatformSeedFormLibraryView,
    PlatformSupportSnapshotView,
    PlatformTenantDetailView,
    PlatformTenantInvitationsView,
    PlatformTenantListCreateView,
)
from apps.tenants.platform_extra_views import (
    PlatformEmailEventsView,
    PlatformImpersonateView,
    PlatformStaffListView,
    PlatformTenantComplianceExportView,
    PlatformTenantDeleteView,
    PlatformTenantExportView,
    PostmarkWebhookView,
    PublicStatusView,
    StripeWebhookView,
    SupportImpersonateExchangeView,
    TenantBillingCheckoutView,
    TenantBillingPortalView,
)
from apps.tenants.views import (
    AcceptInvitationView,
    EmailTemplateDetailView,
    EmailTemplateListView,
    EmailTemplateRestoreView,
    InvitationDetailView,
    InvitationListCreateView,
    InvitationResendView,
    InvitationRevokeView,
    MembershipListView,
    MembershipSendPasswordResetView,
    MembershipUpdateView,
    RestoreEsignAcknowledgementView,
    SignupView,
    SuggestSlugView,
    SlugCheckView,
    TenantMeView,
    TenantSettingsView,
    ThrottledTokenObtainPairView,
)


def health(_request):
    # Public/LB probe: database + Redis only. Celery heartbeat is on Platform → Health.
    payload = run_health_checks(include_celery=False)
    status_code = 200 if payload["status"] == "ok" else 503
    return JsonResponse(payload, status=status_code)


router = DefaultRouter()
router.register(r"companies", CompanyViewSet, basename="company")
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"listings", ListingViewSet, basename="listing")
router.register(r"follow-ups", FollowUpTaskViewSet, basename="follow-up")
router.register(r"follow-up-plans", FollowUpPlanViewSet, basename="follow-up-plan")
router.register(
    r"follow-up-plan-enrollments",
    FollowUpPlanEnrollmentViewSet,
    basename="follow-up-plan-enrollment",
)
router.register(r"documents", DocumentViewSet, basename="document")
router.register(r"templates", TemplateViewSet, basename="template")
router.register(r"envelopes", EnvelopeViewSet, basename="envelope")
router.register(r"dashboard", DashboardViewSet, basename="dashboard")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/status/", PublicStatusView.as_view(), name="public-status"),
    path("api/webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
    path(
        "api/webhooks/postmark/",
        PostmarkWebhookView.as_view(),
        name="postmark-webhook",
    ),
    path("api/public/config/", PublicConfigView.as_view(), name="public-config"),
    path("api/media/<path:path>", ProtectedMediaView.as_view(), name="protected-media"),
    path("api/auth/signup/", SignupView.as_view(), name="signup"),
    path("api/auth/login/", ThrottledTokenObtainPairView.as_view(), name="login"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/slug-check/", SlugCheckView.as_view(), name="slug-check"),
    path("api/auth/suggest-slug/", SuggestSlugView.as_view(), name="suggest-slug"),
    path("api/auth/profile/", ProfileView.as_view(), name="auth-profile"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path(
        "api/auth/password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "api/auth/password-reset/<str:token>/",
        PasswordResetDetailView.as_view(),
        name="password-reset-detail",
    ),
    path(
        "api/auth/password-reset/<str:token>/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "api/auth/invitations/<str:token>/",
        InvitationDetailView.as_view(),
        name="invitation-detail",
    ),
    path(
        "api/auth/invitations/<str:token>/accept/",
        AcceptInvitationView.as_view(),
        name="invitation-accept",
    ),
    path("api/tenant/me/", TenantMeView.as_view(), name="tenant-me"),
    path("api/tenant/settings/", TenantSettingsView.as_view(), name="tenant-settings"),
    path(
        "api/tenant/settings/restore-esign-acknowledgement/",
        RestoreEsignAcknowledgementView.as_view(),
        name="tenant-restore-esign-acknowledgement",
    ),
    path(
        "api/tenant/email-templates/",
        EmailTemplateListView.as_view(),
        name="tenant-email-templates",
    ),
    path(
        "api/tenant/email-templates/<str:key>/",
        EmailTemplateDetailView.as_view(),
        name="tenant-email-template-detail",
    ),
    path(
        "api/tenant/email-templates/<str:key>/restore/",
        EmailTemplateRestoreView.as_view(),
        name="tenant-email-template-restore",
    ),
    path("api/tenant/members/", MembershipListView.as_view(), name="tenant-members"),
    path(
        "api/tenant/members/<int:pk>/",
        MembershipUpdateView.as_view(),
        name="tenant-member-update",
    ),
    path(
        "api/tenant/members/<int:pk>/send-password-reset/",
        MembershipSendPasswordResetView.as_view(),
        name="tenant-member-send-password-reset",
    ),
    path("api/platform/me/", PlatformMeView.as_view(), name="platform-me"),
    path("api/platform/health/", PlatformHealthView.as_view(), name="platform-health"),
    path(
        "api/platform/media/orphans/",
        PlatformMediaOrphansView.as_view(),
        name="platform-media-orphans",
    ),
    path(
        "api/platform/ops-events/",
        PlatformOpsEventListView.as_view(),
        name="platform-ops-events",
    ),
    path(
        "api/platform/tenants/",
        PlatformTenantListCreateView.as_view(),
        name="platform-tenants",
    ),
    path(
        "api/platform/tenants/<int:pk>/",
        PlatformTenantDetailView.as_view(),
        name="platform-tenant-detail",
    ),
    path(
        "api/platform/tenants/<int:pk>/invite-owner/",
        PlatformInviteOwnerView.as_view(),
        name="platform-invite-owner",
    ),
    path(
        "api/platform/tenants/<int:pk>/invitations/",
        PlatformTenantInvitationsView.as_view(),
        name="platform-tenant-invitations",
    ),
    path(
        "api/platform/tenants/<int:pk>/invitations/<int:invite_id>/resend/",
        PlatformInvitationResendView.as_view(),
        name="platform-invitation-resend",
    ),
    path(
        "api/platform/tenants/<int:pk>/invitations/<int:invite_id>/",
        PlatformInvitationRevokeView.as_view(),
        name="platform-invitation-revoke",
    ),
    path(
        "api/platform/tenants/<int:pk>/seed-form-library/",
        PlatformSeedFormLibraryView.as_view(),
        name="platform-seed-form-library",
    ),
    path(
        "api/platform/tenants/<int:pk>/support-snapshot/",
        PlatformSupportSnapshotView.as_view(),
        name="platform-support-snapshot",
    ),
    path(
        "api/platform/tenants/<int:pk>/impersonate/",
        PlatformImpersonateView.as_view(),
        name="platform-impersonate",
    ),
    path(
        "api/platform/tenants/<int:pk>/export/",
        PlatformTenantExportView.as_view(),
        name="platform-tenant-export",
    ),
    path(
        "api/platform/tenants/<int:pk>/compliance-export/",
        PlatformTenantComplianceExportView.as_view(),
        name="platform-tenant-compliance-export",
    ),
    path(
        "api/platform/tenants/<int:pk>/delete/",
        PlatformTenantDeleteView.as_view(),
        name="platform-tenant-delete",
    ),
    path(
        "api/platform/email-events/",
        PlatformEmailEventsView.as_view(),
        name="platform-email-events",
    ),
    path(
        "api/platform/staff/",
        PlatformStaffListView.as_view(),
        name="platform-staff",
    ),
    path(
        "api/auth/support-impersonate/<str:token>/",
        SupportImpersonateExchangeView.as_view(),
        name="support-impersonate-exchange",
    ),
    path(
        "api/tenant/billing/checkout/",
        TenantBillingCheckoutView.as_view(),
        name="tenant-billing-checkout",
    ),
    path(
        "api/tenant/billing/portal/",
        TenantBillingPortalView.as_view(),
        name="tenant-billing-portal",
    ),
    path(
        "api/platform/demo/reset/",
        PlatformDemoResetView.as_view(),
        name="platform-demo-reset",
    ),
    path(
        "api/tenant/invitations/",
        InvitationListCreateView.as_view(),
        name="tenant-invitations",
    ),
    path(
        "api/tenant/invitations/<int:pk>/",
        InvitationRevokeView.as_view(),
        name="tenant-invitation-revoke",
    ),
    path(
        "api/tenant/invitations/<int:pk>/resend/",
        InvitationResendView.as_view(),
        name="tenant-invitation-resend",
    ),
    path("api/sign/<str:token>/", SigningSessionView.as_view(), name="sign-session"),
    path(
        "api/sign/<str:token>/document/",
        SigningDocumentView.as_view(),
        name="sign-document",
    ),
    path("api/sign/<str:token>/consent/", SigningConsentView.as_view(), name="sign-consent"),
    path(
        "api/sign/<str:token>/fields/<int:field_id>/",
        SigningFieldCompleteView.as_view(),
        name="sign-field",
    ),
    path("api/sign/<str:token>/submit/", SigningSubmitView.as_view(), name="sign-submit"),
    path("api/sign/<str:token>/decline/", SigningDeclineView.as_view(), name="sign-decline"),
    path(
        "api/sign/<str:token>/download/",
        SigningDownloadView.as_view(),
        name="sign-download",
    ),
    path("api/", include(router.urls)),
]

# Dev convenience only — production serves documents via /api/media/ and signing document routes.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
