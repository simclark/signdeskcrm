from django.core.management.base import BaseCommand, CommandError

from apps.tenants.services.provision import provision_tenant


class Command(BaseCommand):
    help = "Provision a partner workspace (tenant + owner or invite)."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True, help="Company / workspace name")
        parser.add_argument("--slug", required=True, help="Subdomain slug")
        parser.add_argument("--owner-email", required=True, help="Owner email")
        parser.add_argument("--owner-name", default="", help="Owner full name (optional)")
        parser.add_argument(
            "--password",
            default=None,
            help="If set, create owner account immediately; otherwise send an admin invite",
        )

    def handle(self, *args, **options):
        first_name = ""
        last_name = ""
        owner_name = (options.get("owner_name") or "").strip()
        if owner_name:
            parts = owner_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

        try:
            result = provision_tenant(
                name=options["name"],
                slug=options["slug"],
                owner_email=options["owner_email"],
                owner_first_name=first_name,
                owner_last_name=last_name,
                owner_password=options.get("password"),
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise CommandError(str(exc)) from exc

        tenant = result.tenant
        self.stdout.write(self.style.SUCCESS(f"Provisioned tenant {tenant.slug} ({tenant.name})"))
        self.stdout.write(f"  URL: {tenant.frontend_url('/app')}")
        if result.membership and result.user:
            self.stdout.write(f"  Owner: {result.user.email} (role=owner)")
        if result.invitation:
            self.stdout.write(f"  Invite sent to {result.invitation.email} (role=admin)")
