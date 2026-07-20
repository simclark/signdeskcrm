from django.core.management.base import BaseCommand, CommandError

from apps.tenants.services.demo import DEMO_OWNER_EMAIL_DEFAULT, DEMO_SLUG, reset_demo_tenant


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
            help="Set/reset the demo owner password",
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
        self.stdout.write(f"  Owner: {result.owner_email}")
        if result.password_set:
            self.stdout.write("  Password was set/reset for the demo owner.")
        else:
            self.stdout.write("  Existing owner password unchanged (pass --password to reset).")
        self.stdout.write("  Seeded: Sample Purchase Agreement + Buyer Ada / Seller Sam contacts.")
