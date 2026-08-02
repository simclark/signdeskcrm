from django.core.management.base import BaseCommand, CommandError

from apps.tenants.services.demo import (
    DEMO_ADMIN_EMAIL,
    DEMO_MEMBER_EMAIL,
    DEMO_OWNER_EMAIL_DEFAULT,
    DEMO_PASSWORD_DEFAULT,
    DEMO_SLUG,
    reset_demo_tenant,
)


class Command(BaseCommand):
    help = "Reset the reserved demo workspace to a single-contract pitch state."

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner-email",
            default=DEMO_OWNER_EMAIL_DEFAULT,
            help=f"Demo owner email (default: {DEMO_OWNER_EMAIL_DEFAULT})",
        )
        parser.add_argument(
            "--password",
            default=None,
            help=(
                f"Set/reset password for Owner, Admin, and Member "
                f"(default: {DEMO_PASSWORD_DEFAULT})"
            ),
        )

    def handle(self, *args, **options):
        try:
            result = reset_demo_tenant(
                owner_email=options["owner_email"],
                owner_password=options.get("password"),
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        tenant = result.tenant
        if tenant.slug != DEMO_SLUG:
            raise CommandError("Demo reset produced a non-demo tenant; aborting.")

        self.stdout.write(self.style.SUCCESS(f"Reset demo tenant '{tenant.slug}'"))
        self.stdout.write(f"  URL: {tenant.frontend_url('/login')}")
        self.stdout.write(f"  Owner:  {result.owner_email}")
        self.stdout.write(f"  Admin:  {DEMO_ADMIN_EMAIL}")
        self.stdout.write(f"  Member: {DEMO_MEMBER_EMAIL}")
        self.stdout.write(
            f"  Password set for all three "
            f"({options.get('password') or DEMO_PASSWORD_DEFAULT})."
        )
        self.stdout.write("  Seeded: Sample Purchase Agreement + Buyer Ada / Seller Sam contacts.")
