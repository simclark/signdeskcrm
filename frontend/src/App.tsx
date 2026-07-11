import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { theme } from './app/theme'
import { AppLayout } from './app/AppLayout'
import { AuthProvider } from './features/auth/AuthContext'
import { SignupPage } from './features/auth/SignupPage'
import { LoginPage } from './features/auth/LoginPage'
import { LandingPage } from './features/marketing/LandingPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ContactsPage } from './features/contacts/ContactsPage'
import { ContactDetailPage } from './features/contacts/ContactDetailPage'
import { CompaniesPage } from './features/contacts/CompaniesPage'
import { DocumentsPage } from './features/documents/DocumentsPage'
import { TemplatesPage } from './features/documents/TemplatesPage'
import { EnvelopesPage } from './features/envelopes/EnvelopesPage'
import { EnvelopeComposerPage } from './features/envelopes/EnvelopeComposerPage'
import { EnvelopeDetailPage } from './features/envelopes/EnvelopeDetailPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SigningPage } from './features/signing/SigningPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/sign/:token" element={<SigningPage />} />
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="contacts" element={<ContactsPage />} />
                <Route path="contacts/:id" element={<ContactDetailPage />} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="envelopes" element={<EnvelopesPage />} />
                <Route path="envelopes/new" element={<EnvelopeComposerPage />} />
                <Route path="envelopes/:id" element={<EnvelopeDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  )
}
