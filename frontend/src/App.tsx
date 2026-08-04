import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { theme } from './app/theme'
import { AppLayout } from './app/AppLayout'
import { AuthProvider } from './features/auth/AuthContext'
import { SignupPage } from './features/auth/SignupPage'
import { LoginPage } from './features/auth/LoginPage'
import { AcceptInvitePage } from './features/auth/AcceptInvitePage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { LandingPage } from './features/marketing/LandingPage'
import { PrivacyPolicyPage } from './features/marketing/PrivacyPolicyPage'
import { TermsOfServicePage } from './features/marketing/TermsOfServicePage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ContactsPage } from './features/contacts/ContactsPage'
import { ContactDetailPage } from './features/contacts/ContactDetailPage'
import { CompaniesPage } from './features/contacts/CompaniesPage'
import { CompanyDetailPage } from './features/contacts/CompanyDetailPage'
import { ListingsPage } from './features/contacts/ListingsPage'
import { FollowUpsPage } from './features/contacts/FollowUpsPage'
import { FollowUpPlansPage } from './features/contacts/FollowUpPlansPage'
import { DocumentsPage } from './features/documents/DocumentsPage'
import { TemplatesPage } from './features/documents/TemplatesPage'
import { TemplatePreparePage } from './features/documents/TemplatePreparePage'
import { EnvelopesPage } from './features/envelopes/EnvelopesPage'
import { EnvelopePreparePage } from './features/envelopes/EnvelopePreparePage'
import { EnvelopeDetailPage } from './features/envelopes/EnvelopeDetailPage'
import { SettingsPage } from './features/administration/SettingsPage'
import { HelpPage } from './features/help/HelpPage'
import { HelpArticlePage } from './features/help/HelpArticlePage'
import { PlatformLayout } from './features/platform/PlatformLayout'
import { PlatformTenantsPage } from './features/platform/PlatformTenantsPage'
import { PlatformTenantDetailPage } from './features/platform/PlatformTenantDetailPage'
import { PlatformDemoPage } from './features/platform/PlatformDemoPage'
import { PlatformHealthPage } from './features/platform/PlatformHealthPage'
import { PlatformMediaPage } from './features/platform/PlatformMediaPage'
import { PlatformAuditPage } from './features/platform/PlatformAuditPage'
import { RedirectToPlatformHost } from './features/platform/RedirectToPlatformHost'
import { SigningPage } from './features/signing/SigningPage'
import { isApexHost, isPlatformHost } from './shared/api'
import { ConfirmProvider } from './shared/confirm'

const queryClient = new QueryClient()

function RootEntry() {
  if (isPlatformHost()) return <Navigate to="/" replace />
  if (isApexHost()) return <LandingPage />
  return <Navigate to="/login" replace />
}

const platformRouter = createBrowserRouter([
  {
    path: '/',
    element: <PlatformLayout />,
    children: [
      { index: true, element: <PlatformTenantsPage /> },
      { path: 'tenants/:id', element: <PlatformTenantDetailPage /> },
      { path: 'health', element: <PlatformHealthPage /> },
      { path: 'media', element: <PlatformMediaPage /> },
      { path: 'audit', element: <PlatformAuditPage /> },
      { path: 'demo', element: <PlatformDemoPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/platform', element: <Navigate to="/" replace /> },
  { path: '/platform/*', element: <Navigate to="/" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

const appRouter = createBrowserRouter([
  { path: '/', element: <RootEntry /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/terms', element: <TermsOfServicePage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  { path: '/sign/:token', element: <SigningPage /> },
  { path: '/platform', element: <RedirectToPlatformHost /> },
  { path: '/platform/*', element: <RedirectToPlatformHost /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'contacts/:id', element: <ContactDetailPage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'companies/:id', element: <CompanyDetailPage /> },
      { path: 'listings', element: <ListingsPage /> },
      { path: 'follow-ups', element: <FollowUpsPage /> },
      { path: 'follow-up-plans', element: <FollowUpPlansPage /> },
      { path: 'cadences', element: <Navigate to="/app/follow-up-plans" replace /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'templates/:id/prepare', element: <TemplatePreparePage /> },
      { path: 'envelopes', element: <EnvelopesPage /> },
      { path: 'envelopes/new', element: <Navigate to="/app/envelopes" replace /> },
      { path: 'envelopes/:id/prepare', element: <EnvelopePreparePage /> },
      { path: 'envelopes/:id', element: <EnvelopeDetailPage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'help/:slug', element: <HelpArticlePage /> },
      {
        path: 'administration',
        children: [
          { index: true, element: <Navigate to="/app/administration/settings" replace /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: 'settings', element: <Navigate to="/app/administration/settings" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

const router = isPlatformHost() ? platformRouter : appRouter

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ConfirmProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
