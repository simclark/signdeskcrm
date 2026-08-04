import { Alert, Badge, Button, Group, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../../shared/api'
import { PageBreadcrumbs } from '../../shared/PageBreadcrumbs'
import { newFieldId, type FieldDraft } from '../envelopes/types'
import { PdfFieldMapper } from './PdfFieldMapper'
import {
  draftsSnapshot,
  fieldsFromLayout,
  layoutFromFields,
  rolesFromLayout,
  rolesPayloadFromDrafts,
  type RoleDraft,
} from './pdfFieldMapperUtils'
import type { TemplateDetail } from './templateTypes'

export function TemplatePreparePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { membership } = useAuth()
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'
  const [roles, setRoles] = useState<RoleDraft[]>([])
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const leaveRef = useRef(false)

  const { data: template, isLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: () => api<TemplateDetail>(`/api/templates/${id}/`),
    enabled: !!id,
  })

  const isReadOnly =
    Boolean(template?.library_key) || (Boolean(template?.is_library) && !isAdmin)
  const isDirty =
    !isReadOnly && hydrated && draftsSnapshot(roles, fields) !== savedSnapshot

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (leaveRef.current) return false
    return isDirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (!template || hydrated) return
    const layout = Array.isArray(template.field_layout) ? template.field_layout : []
    const nextRoles =
      template.roles?.length
        ? rolesFromLayout(layout, template.roles)
        : layout.length > 0
          ? rolesFromLayout(layout)
          : [
              {
                name: 'Signer 1',
                email: '',
                role: 'signer' as const,
                routing_order: 1,
                contact: null,
              },
            ]
    const nextFields = fieldsFromLayout(layout, newFieldId)
    setRoles(nextRoles)
    setFields(nextFields)
    setSavedSnapshot(draftsSnapshot(nextRoles, nextFields))
    setHydrated(true)
  }, [template, hydrated])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm('You have unsaved changes. Leave without saving?')
    if (leave) {
      leaveRef.current = true
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  const save = useMutation({
    mutationFn: async ({ continueAfter }: { continueAfter: boolean }) => {
      if (!id) throw new Error('Missing template')
      if (isReadOnly) {
        throw new Error('Shared library templates cannot be edited. Clone the template first.')
      }
      if (!fields.length) throw new Error('Place at least one field on the document')
      for (let i = 0; i < roles.length; i++) {
        const hasSignature = fields.some(
          (f) => f.recipientIndex === i && f.field_type === 'signature',
        )
        if (!hasSignature) {
          throw new Error(`${roles[i].name.trim() || `Signer ${i + 1}`} needs a signature field`)
        }
      }
      const updated = await api<TemplateDetail>(`/api/templates/${id}/`, {
        method: 'PATCH',
        json: {
          field_layout: layoutFromFields(fields),
          roles: rolesPayloadFromDrafts(roles),
        },
      })
      return {
        template: updated,
        continueAfter,
        snapshot: draftsSnapshot(roles, fields),
      }
    },
    onSuccess: ({ continueAfter, snapshot }) => {
      setSavedSnapshot(snapshot)
      qc.invalidateQueries({ queryKey: ['template', id] })
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({
        color: 'forest',
        message: continueAfter ? 'Template saved' : 'Progress saved',
      })
      if (continueAfter) {
        leaveRef.current = true
        navigate('/app/templates')
      }
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: err.message }),
  })

  const clone = useMutation({
    mutationFn: () =>
      api<TemplateDetail>(`/api/templates/${id}/clone/`, { method: 'POST', json: {} }),
    onSuccess: (cloned) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({ color: 'forest', message: 'Template cloned — customize this copy' })
      leaveRef.current = true
      navigate(`/app/templates/${cloned.id}/prepare`)
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not clone', message: err.message }),
  })

  const setActive = useMutation({
    mutationFn: (is_active: boolean) =>
      api<TemplateDetail>(`/api/templates/${id}/`, {
        method: 'PATCH',
        json: { is_active },
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['template', id] })
      qc.invalidateQueries({ queryKey: ['templates'] })
      notifications.show({
        color: 'forest',
        message: updated.is_active ? 'Template activated' : 'Template deactivated',
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not update status', message: err.message }),
  })

  if (isLoading || !template || !hydrated) return null

  return (
    <Stack gap="md">
      <PageBreadcrumbs
        items={[
          { label: 'Templates', to: '/app/templates' },
          { label: template.name },
        ]}
      />
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm" mb={4}>
            <Title order={2}>Template: {template.name}</Title>
            {template.is_library ? (
              <Badge variant="light" color="teal">
                Library
              </Badge>
            ) : null}
            <Badge variant="light" color={template.is_active ? 'forest' : 'gray'}>
              {template.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </Group>
          <Text c="dimmed">
            {isReadOnly
              ? 'This Shared library template is read-only. Clone it to place fields and customize the layout for your workspace.'
              : `Place fields on ${template.document_title || 'the PDF'}. This layout can be applied to any uploaded document when creating an envelope. Inactive templates stay editable but are hidden from envelope dropdowns.`}
          </Text>
        </div>
        {!isReadOnly ? (
          <Switch
            label={template.is_active ? 'Active' : 'Inactive'}
            checked={template.is_active}
            onChange={(e) => setActive.mutate(e.currentTarget.checked)}
          />
        ) : null}
      </Group>

      {isReadOnly ? (
        <Alert color="blue" title="Read-only shared library form">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm">
              Edits are blocked on Shared library forms. Clone to create an editable workspace copy.
            </Text>
            <Button onClick={() => clone.mutate()} loading={clone.isPending}>
              Clone to edit
            </Button>
          </Group>
        </Alert>
      ) : null}

      <PdfFieldMapper
        documentFileUrl={template.document_file_url}
        initialPageCount={template.page_count || 1}
        roles={roles}
        fields={fields}
        onRolesChange={isReadOnly ? () => undefined : setRoles}
        onFieldsChange={isReadOnly ? () => undefined : setFields}
        editableContacts={false}
        rolesTitle="Signer roles"
        addRoleLabel="Add signer role"
        rolesHint="Name each signing slot (not a person yet). Map contacts when you create an envelope."
        sidebarActions={
          isReadOnly ? (
            <Stack gap="xs">
              <Button fullWidth onClick={() => clone.mutate()} loading={clone.isPending}>
                Clone to edit
              </Button>
              <Button
                variant="default"
                fullWidth
                onClick={() => {
                  leaveRef.current = true
                  navigate('/app/templates')
                }}
              >
                Back to templates
              </Button>
            </Stack>
          ) : (
            <Stack gap="xs">
              <Button
                fullWidth
                onClick={() => save.mutate({ continueAfter: true })}
                loading={save.isPending && save.variables?.continueAfter === true}
              >
                Save & done
              </Button>
              <Group gap="xs" grow>
                <Button
                  variant="default"
                  onClick={() => {
                    leaveRef.current = false
                    navigate('/app/templates')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="light"
                  onClick={() => save.mutate({ continueAfter: false })}
                  loading={save.isPending && save.variables?.continueAfter === false}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          )
        }
      />
    </Stack>
  )
}
