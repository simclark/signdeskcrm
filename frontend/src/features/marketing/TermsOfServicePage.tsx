import { Text, Title } from '@mantine/core'
import { LegalPageLayout } from './LegalPageLayout'

export function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <Text>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of SignDesk websites,
        workspaces, and electronic signature features (the &quot;Services&quot;). By creating a
        workspace, accepting an invitation, or using the Services, you agree to these Terms.
      </Text>

      <Title order={3}>1. The Services</Title>
      <Text>
        SignDesk provides multi-tenant workspace software for managing contacts and sending documents
        for electronic signature. Features, availability, and free-trial duration may change. Design
        partners may be subject to separate written beta or pilot terms.
      </Text>

      <Title order={3}>2. Accounts and workspaces</Title>
      <Text>
        You must provide accurate registration information and keep credentials confidential. You
        are responsible for activity under your account and for ensuring workspace members comply
        with these Terms. We may suspend workspaces that pose security, legal, or abuse risks.
      </Text>

      <Title order={3}>3. Free trials and subscriptions</Title>
      <Text>
        New workspaces may receive a free trial. When a trial ends, the workspace may become
        read-only until a paid subscription is activated or the trial is extended by SignDesk.
        Paid billing, when enabled, is handled through our payment processor; additional billing
        terms will apply at checkout.
      </Text>

      <Title order={3}>4. Customer content and e-sign responsibilities</Title>
      <Text>
        You retain ownership of documents and data you upload (&quot;Customer Content&quot;). You grant
        SignDesk a limited license to host, process, and transmit Customer Content solely to provide
        the Services. You are responsible for obtaining any consents required to collect signatures,
        for the legality of documents you send, and for determining whether electronic signatures
        are appropriate for your transaction. SignDesk provides tools and audit evidence; it does
        not provide legal advice.
      </Text>

      <Title order={3}>5. Acceptable use</Title>
      <Text>
        You may not misuse the Services, attempt unauthorized access, interfere with other
        customers, send unlawful or deceptive content, or reverse engineer the Services except where
        permitted by law.
      </Text>

      <Title order={3}>6. Intellectual property</Title>
      <Text>
        SignDesk and its licensors own the Services, branding, and underlying software. These Terms
        do not transfer any ownership rights to you other than the limited right to use the Services
        as permitted herein.
      </Text>

      <Title order={3}>7. Disclaimers</Title>
      <Text>
        THE SERVICES ARE PROVIDED &quot;AS IS.&quot; TO THE MAXIMUM EXTENT PERMITTED BY LAW, SIGNDESK
        DISCLAIMS WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT. We do not warrant that the Services will be uninterrupted or error-free.
      </Text>

      <Title order={3}>8. Limitation of liability</Title>
      <Text>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, SIGNDESK WILL NOT BE LIABLE FOR INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA. OUR
        AGGREGATE LIABILITY ARISING OUT OF THESE TERMS OR THE SERVICES WILL NOT EXCEED THE AMOUNTS
        YOU PAID TO SIGNDESK FOR THE SERVICES IN THE TWELVE MONTHS BEFORE THE CLAIM.
      </Text>

      <Title order={3}>9. Termination</Title>
      <Text>
        You may stop using the Services at any time. We may suspend or terminate access for breach
        of these Terms or if required to protect the Services or other users. Provisions that by
        their nature should survive will survive termination.
      </Text>

      <Title order={3}>10. Changes</Title>
      <Text>
        We may update these Terms by posting a revised version with an updated date. Continued use
        after the effective date constitutes acceptance.
      </Text>

      <Title order={3}>11. Contact</Title>
      <Text>
        Questions about these Terms: <a href="mailto:support@signdeskcrm.com">support@signdeskcrm.com</a>
      </Text>
    </LegalPageLayout>
  )
}
