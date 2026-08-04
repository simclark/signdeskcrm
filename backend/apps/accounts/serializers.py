from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import PasswordResetToken
from apps.accounts.services import issue_password_reset

User = get_user_model()


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "email": self.user.email,
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "full_name": self.user.full_name,
            "is_staff": self.user.is_staff,
        }
        return data


class ProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "full_name", "is_staff")
        read_only_fields = ("id", "email", "full_name", "is_staff")


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        from apps.accounts.tokens import blacklist_user_outstanding_tokens

        blacklist_user_outstanding_tokens(user)
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self, **kwargs):
        """Issue a reset for platform staff or an active member of the current tenant.

        Always succeeds from the caller's perspective — the view returns a generic
        message so we do not leak whether the account exists.
        """
        email = self.validated_data["email"].lower().strip()
        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            return None

        if self.context.get("platform"):
            if not user.is_staff:
                return None
            return issue_password_reset(user=user, tenant=None)

        tenant = self.context["tenant"]
        from apps.tenants.models import Membership

        if not Membership.objects.filter(
            tenant=tenant, user=user, is_active=True
        ).exists():
            return None
        return issue_password_reset(user=user, tenant=tenant)


class PasswordResetConfirmSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value):
        reset: PasswordResetToken = self.context["reset"]
        validate_password(value, reset.user)
        return value

    def save(self, **kwargs):
        reset: PasswordResetToken = self.context["reset"]
        user = reset.user
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password"])
        reset.used_at = timezone.now()
        reset.save(update_fields=["used_at"])
        PasswordResetToken.objects.filter(
            user=user, used_at__isnull=True
        ).exclude(pk=reset.pk).update(used_at=timezone.now())
        from apps.accounts.tokens import blacklist_user_outstanding_tokens

        blacklist_user_outstanding_tokens(user)
        return user
