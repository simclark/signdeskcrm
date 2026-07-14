from django.test import SimpleTestCase

from apps.documents.merge import build_merge_context, resolve_merge_token
from apps.documents.pdf_import import layout_from_import_payload


class MergeTokenTests(SimpleTestCase):
    def test_resolve_nested_token(self):
        class Obj:
            first_name = "Ada"
            last_name = "Lovelace"
            email = "ada@example.com"
            phone = ""
            title = ""

            @property
            def full_name(self):
                return "Ada Lovelace"

            company = None

        class Listing:
            address = "123 Main"
            city = "Austin"
            state = "TX"
            postal_code = "78701"
            mls_number = "MLS-1"
            price = "400000"
            beds = None
            baths = None
            sqft = None
            year_built = None
            description = ""

            @property
            def full_address(self):
                return "123 Main, Austin, TX, 78701"

        ctx = build_merge_context(
            contact=Obj(),
            listing=Listing(),
            deal={"price": "410000"},
        )
        self.assertEqual(resolve_merge_token("contact.full_name", ctx), "Ada Lovelace")
        self.assertEqual(resolve_merge_token("listing.city", ctx), "Austin")
        self.assertEqual(resolve_merge_token("deal.price", ctx), "410000")
        self.assertEqual(resolve_merge_token("{{listing.mls_number}}", ctx), "MLS-1")

    def test_custom_and_deal_freeform_tokens(self):
        ctx = build_merge_context(
            deal={
                "price": "500000",
                "lender_name": "Acme Lending",
                "custom": {"loan_number": "LN-99"},
            }
        )
        self.assertEqual(resolve_merge_token("deal.price", ctx), "500000")
        self.assertEqual(resolve_merge_token("deal.lender_name", ctx), "Acme Lending")
        self.assertEqual(resolve_merge_token("custom.loan_number", ctx), "LN-99")
        self.assertEqual(resolve_merge_token("custom.missing", ctx), "")


class FieldMapImportTests(SimpleTestCase):
    def test_layout_from_import_payload(self):
        layout = layout_from_import_payload(
            [
                {
                    "type": "signHere",
                    "page": 1,
                    "x": 0.1,
                    "y": 0.2,
                    "width": 0.3,
                    "height": 0.05,
                    "name": "Buyer Sig",
                    "role": "buyer",
                }
            ]
        )
        self.assertEqual(len(layout), 1)
        self.assertEqual(layout[0]["field_type"], "signature")
        self.assertEqual(layout[0]["role_key"], "buyer")
        self.assertEqual(layout[0]["label"], "Buyer Sig")
        self.assertEqual(layout[0]["fill_mode"], "signer")


class TemplateLayoutFillModeTests(SimpleTestCase):
    def test_listing_token_infers_document_fill_mode(self):
        from apps.documents.serializers import validate_field_layout

        layout = validate_field_layout(
            [
                {
                    "field_type": "text",
                    "page": 1,
                    "x": 0.1,
                    "y": 0.1,
                    "w": 0.2,
                    "h": 0.04,
                    "recipient_index": 0,
                    "merge_token": "listing.full_address",
                    "label": "Property address",
                }
            ]
        )
        self.assertEqual(layout[0]["fill_mode"], "document")
        self.assertIsNone(layout[0]["recipient_index"])

    def test_role_token_infers_document_fill_mode(self):
        from apps.documents.serializers import validate_field_layout

        layout = validate_field_layout(
            [
                {
                    "field_type": "text",
                    "page": 1,
                    "x": 0.1,
                    "y": 0.1,
                    "w": 0.2,
                    "h": 0.04,
                    "merge_token": "role.buyer.name",
                    "label": "Buyer name",
                }
            ]
        )
        self.assertEqual(layout[0]["fill_mode"], "document")
        self.assertIsNone(layout[0]["recipient_index"])

    def test_explicit_signer_fill_mode_wins(self):
        from apps.documents.serializers import validate_field_layout

        layout = validate_field_layout(
            [
                {
                    "field_type": "text",
                    "page": 1,
                    "x": 0.1,
                    "y": 0.1,
                    "w": 0.2,
                    "h": 0.04,
                    "recipient_index": 0,
                    "merge_token": "deal.price",
                    "fill_mode": "signer",
                    "label": "Price",
                }
            ]
        )
        self.assertEqual(layout[0]["fill_mode"], "signer")
        self.assertEqual(layout[0]["recipient_index"], 0)

    def test_document_fill_mode_clears_recipient_index(self):
        from apps.documents.serializers import validate_field_layout

        layout = validate_field_layout(
            [
                {
                    "field_type": "text",
                    "page": 1,
                    "x": 0.1,
                    "y": 0.1,
                    "w": 0.2,
                    "h": 0.04,
                    "recipient_index": 2,
                    "role_key": "agent",
                    "merge_token": "listing.mls_number",
                    "fill_mode": "document",
                    "label": "MLS",
                }
            ]
        )
        self.assertEqual(layout[0]["fill_mode"], "document")
        self.assertIsNone(layout[0]["recipient_index"])
        self.assertEqual(layout[0]["role_key"], "")
