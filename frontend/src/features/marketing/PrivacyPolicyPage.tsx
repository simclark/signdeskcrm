import { Text, Title } from '@mantine/core'
import { LegalPageLayout } from './LegalPageLayout'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <Text>
        This Privacy Policy describes how SignDesk (&quot;SignDesk,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;) collects, uses, and shares information when you use our websites, workspace
        applications, and electronic signature services (collectively, the &quot;Services&quot;).
      </Text>

      <Title order={3}>1. Information we collect</Title>
      <Text>
        Account and workspace data: name, email address, company name, workspace subdomain, and
        authentication credentials. Content you upload or create: contacts, companies, documents,
        templates, envelopes, signature images, and related metadata. Signer data: name, email,
        IP address, user agent, consent acknowledgements, and signing audit events. Technical data:
        logs, device/browser information, and diagnostic events needed to operate and secure the
        Services.
      </Text>

      <Title order={3}>2. How we use information</Title>
      <Text>
        We use information to provide and improve the Services, authenticate users, send
        transactional email (invites, signing links, reminders, password resets, trial notices),
        maintain audit and Certificate of Completion records, prevent abuse, and communicate about
        the Services. We do not sell personal information.
      </Text>

      <Title order={3}>3. Sharing</Title>
      <Text>
        We share information with service providers that help us operate (for example hosting,
        email delivery, object storage, and error monitoring), when required by law, or with your
        direction (for example delivering a signing request to a recipient you designate). Workspace
        administrators control who has access inside their tenant.
      </Text>

      <Title order={3}>4. Retention</Title>
      <Text>
        We retain account and audit data for as long as needed to provide the Services and meet
        legal obligations. Workspaces may configure document retention for completed envelopes.
        After deletion or retention purge, residual copies may remain in encrypted backups for a
        limited period.
      </Text>

      <Title order={3}>5. Security</Title>
      <Text>
        We use industry-standard safeguards including TLS in production, access controls, and
        private object storage for signed documents. No method of transmission or storage is
        completely secure.
      </Text>

      <Title order={3}>6. Your choices</Title>
      <Text>
        Workspace members can update profile details in-product. Contact us to request account
        closure or to ask questions about personal information we process as a service provider to
        your workspace. Signers should contact the sending organization for requests about documents
        they were asked to sign.
      </Text>

      <Title order={3}>7. Children</Title>
      <Text>The Services are not directed to children under 16, and we do not knowingly collect their personal information.</Text>

      <Title order={3}>8. Changes</Title>
      <Text>
        We may update this policy from time to time. The &quot;Last updated&quot; date above reflects the
        latest revision. Continued use of the Services after changes means you accept the updated
        policy.
      </Text>

      <Title order={3}>9. Contact</Title>
      <Text>
        Privacy questions: <a href="mailto:support@signdeskcrm.com">support@signdeskcrm.com</a>
      </Text>
    </LegalPageLayout>
  )
}
