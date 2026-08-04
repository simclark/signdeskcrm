import gettingStarted from './getting-started.md?raw'
import roles from './roles-and-permissions.md?raw'
import dashboard from './dashboard.md?raw'
import envelopes from './envelopes.md?raw'
import documents from './documents.md?raw'
import templates from './templates-and-form-library.md?raw'
import contacts from './contacts.md?raw'
import companies from './companies.md?raw'
import listings from './listings.md?raw'
import followUps from './follow-ups.md?raw'
import followUpPlans from './follow-up-plans.md?raw'
import settings from './settings.md?raw'
import signing from './signing.md?raw'
import glossary from './glossary.md?raw'

export type HelpCategory = 'start' | 'esign' | 'crm' | 'admin' | 'reference'

export type HelpArticle = {
  slug: string
  title: string
  description: string
  category: HelpCategory
  body: string
}

export const HELP_CATEGORIES: Record<HelpCategory, string> = {
  start: 'Getting started',
  esign: 'E-signature',
  crm: 'CRM & outreach',
  admin: 'Administration',
  reference: 'Reference',
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Create a workspace, log in, invite your team, and set up the basics.',
    category: 'start',
    body: gettingStarted,
  },
  {
    slug: 'roles-and-permissions',
    title: 'Roles and permissions',
    description: 'What Owners, Admins, and Members can do in the workspace.',
    category: 'start',
    body: roles,
  },
  {
    slug: 'dashboard',
    title: 'Dashboard',
    description: 'Envelope health at a glance — awaiting others, drafts, and more.',
    category: 'esign',
    body: dashboard,
  },
  {
    slug: 'envelopes',
    title: 'Envelopes',
    description: 'Prepare, send, track, and complete documents for signature.',
    category: 'esign',
    body: envelopes,
  },
  {
    slug: 'documents',
    title: 'Documents',
    description: 'Upload and manage the shared PDF library.',
    category: 'esign',
    body: documents,
  },
  {
    slug: 'templates-and-form-library',
    title: 'Templates & Shared library',
    description: 'Reusable layouts and workspace-published Shared library forms.',
    category: 'esign',
    body: templates,
  },
  {
    slug: 'signing',
    title: 'Signing experience',
    description: 'What recipients see when they open a signing link.',
    category: 'esign',
    body: signing,
  },
  {
    slug: 'contacts',
    title: 'Contacts',
    description: 'People you work with, stages, activity, and related envelopes.',
    category: 'crm',
    body: contacts,
  },
  {
    slug: 'companies',
    title: 'Companies',
    description: 'Organizations linked to your contacts.',
    category: 'crm',
    body: companies,
  },
  {
    slug: 'listings',
    title: 'Listings / Prefill records',
    description: 'Optional records that fill document fields on prepare.',
    category: 'crm',
    body: listings,
  },
  {
    slug: 'follow-ups',
    title: 'Follow-ups',
    description: 'Manual outreach tasks for contacts.',
    category: 'crm',
    body: followUps,
  },
  {
    slug: 'follow-up-plans',
    title: 'Follow-up plans',
    description: 'Automated email sequences after envelopes stall, decline, or complete.',
    category: 'crm',
    body: followUpPlans,
  },
  {
    slug: 'settings',
    title: 'Settings',
    description: 'Workspace, branding, email, e-signature defaults, and members.',
    category: 'admin',
    body: settings,
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    description: 'Product terms used across SignDesk.',
    category: 'reference',
    body: glossary,
  },
]

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug)
}

/** Strip the leading H1 from markdown so the page title is not duplicated. */
export function articleBodyWithoutTitle(body: string): string {
  return body.replace(/^#\s+[^\n]+\n+/, '')
}
