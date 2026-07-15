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
import { LandingPage } from './features/marketing/LandingPage'
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
import { SigningPage } from './features/signing/SigningPage'
import { isApexHost } from './shared/api'

const queryClient = new QueryClient()

function RootEntry() {
  if (isApexHost()) return <LandingPage />
  return <Navigate to="/login" replace />
}

const router = createBrowserRouter([
  { path: '/', element: <RootEntry /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  { path: '/sign/:token', element: <SigningPage /> },
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

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
