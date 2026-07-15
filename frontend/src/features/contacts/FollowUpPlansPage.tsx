import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconMail,
  IconPhone,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'

type PlanStep = {
  id?: number
  offset_days: number
  subject: string
  body: string
  order: number
}

type FollowUpPlan = {
  id: number
  name: string
  description: string
  trigger: 'stalled' | 'declined' | 'completed'
  idle_hours: number
  create_agent_handoff: boolean
  handoff_title: string
  is_active: boolean
  steps: PlanStep[]
}

type PlanFormValues = {
  name: string
  description: string
  trigger: FollowUpPlan['trigger']
  idle_hours: number
  create_agent_handoff: boolean
  handoff_title: string
  is_active: boolean
  steps: PlanStep[]
}

const TRIGGER_LABELS: Record<FollowUpPlan['trigger'], string> = {
  stalled: 'Signer idle after send',
  declined: 'Recipient declined',
  completed: 'Envelope completed',
}

const TRIGGER_HELP: Record<FollowUpPlan['trigger'], string> = {
  stalled:
    'Starts after a signer is invited and remains unsigned. Replaces tenant reminder emails for envelopes using this plan.',
  declined: 'Starts when a signer declines. Use for apology / next-step outreach.',
  completed: 'Starts when the envelope is fully signed. Use for next-step or closing messages.',
}

const PLACEHOLDERS = [
  { token: '{{recipient_name}}', label: 'Recipient' },
  { token: '{{envelope_title}}', label: 'Envelope' },
  { token: '{{sign_link}}', label: 'Sign link' },
  { token: '{{listing_address}}', label: 'Listing' },
] as const

const blankStep = (order: number, offsetDays = 0): PlanStep => ({
  order,
  offset_days: offsetDays,
  subject: '',
  body: '',
})

const defaultSteps = (): PlanStep[] => [
  {
    order: 1,
    offset_days: 0,
    subject: 'Still need a signature on {{envelope_title}}',
    body: 'Hi {{recipient_name}},\n\nJust a reminder — your signature is waiting on {{envelope_title}}.\n\nSign here: {{sign_link}}\n\nThanks!',
  },
  {
    order: 2,
    offset_days: 2,
    subject: 'Quick follow-up: {{envelope_title}}',
    body: 'Hi {{recipient_name}},\n\nChecking in again on {{envelope_title}}. The packet is ready whenever you are:\n{{sign_link}}',
  },
  {
    order: 3,
    offset_days: 5,
    subject: 'Last reminder for {{envelope_title}}',
    body: 'Hi {{recipient_name}},\n\nThis is our last automated reminder for {{envelope_title}}. Reply if you have questions.\n\n{{sign_link}}',
  },
]

const initialFormValues = (): PlanFormValues => ({
  name: '',
  description: '',
  trigger: 'stalled',
  idle_hours: 48,
  create_agent_handoff: true,
  handoff_title: 'Call signer — stalled packet',
  is_active: true,
  steps: defaultSteps(),
})

function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  token: string,
): string {
  if (!el) {
    return current ? `${current} ${token}` : token
  }
  const start = el.selectionStart ?? current.length
  const end = el.selectionEnd ?? current.length
  return `${current.slice(0, start)}${token}${current.slice(end)}`
}

function PlaceholderChips({
  onInsert,
}: {
  onInsert: (token: string) => void
}) {
  return (
    <Group gap={6} wrap="wrap">
      <Text size="xs" c="dimmed">
        Insert:
      </Text>
      {PLACEHOLDERS.map((p) => (
        <Tooltip key={p.token} label={p.token} withArrow>
          <Badge
            variant="outline"
            color="gray"
            size="sm"
            style={{ cursor: 'pointer', textTransform: 'none', fontWeight: 500 }}
            onClick={() => onInsert(p.token)}
          >
            {p.label}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  )
}

function TimelinePreview({
  steps,
  idleHours,
  trigger,
  handoff,
}: {
  steps: PlanStep[]
  idleHours: number
  trigger: FollowUpPlan['trigger']
  handoff: string | null
}) {
  const nodes: { label: string; detail: string }[] = []
  if (trigger === 'stalled') {
    nodes.push({
      label: 'Invite',
      detail: idleHours === 0 ? 'Then immediately' : `Wait ${idleHours}h idle`,
    })
  } else {
    nodes.push({
      label: trigger === 'declined' ? 'Declined' : 'Completed',
      detail: 'Plan starts',
    })
  }
  steps.forEach((s, i) => {
    nodes.push({
      label: `Email ${i + 1}`,
      detail: `Day ${s.offset_days}`,
    })
  })
  if (handoff) {
    nodes.push({ label: 'Task', detail: handoff })
  }

  return (
    <Paper withBorder radius="md" p="sm" bg="gray.0">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={8} style={{ letterSpacing: '0.04em' }}>
        Schedule preview
      </Text>
      <Group gap="xs" wrap="wrap">
        {nodes.map((n, i) => (
          <Group key={`${n.label}-${i}`} gap={6}>
            {i > 0 ? (
              <Text size="xs" c="dimmed">
                →
              </Text>
            ) : null}
            <Badge variant="light" color={n.label === 'Task' ? 'orange' : 'forest'} tt="none">
              {n.label}
              <Text span size="xs" c="dimmed" ml={6}>
                {n.detail}
              </Text>
            </Badge>
          </Group>
        ))}
      </Group>
    </Paper>
  )
}

export function FollowUpPlansPage() {
  const qc = useQueryClient()
  const [opened, { open, close }] = useDisclosure(false)
  const [editing, setEditing] = useState<FollowUpPlan | null>(null)
  const subjectRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const bodyRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const [activeField, setActiveField] = useState<{
    index: number
    field: 'subject' | 'body'
  } | null>(null)

  const form = useForm<PlanFormValues>({
    initialValues: initialFormValues(),
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
      idle_hours: (v, values) =>
        values.trigger === 'stalled' && (v == null || v < 0)
          ? 'Enter idle hours (0 or more)'
          : null,
      handoff_title: (v, values) =>
        values.create_agent_handoff && !v.trim() ? 'Task title is required' : null,
      steps: {
        subject: (v) => (!v.trim() ? 'Subject is required' : null),
        body: (v) => (!v.trim() ? 'Body is required' : null),
        offset_days: (v) => (v == null || v < 0 ? 'Enter days (0 or more)' : null),
      },
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['follow-up-plans'],
    queryFn: () => api<{ results: FollowUpPlan[] }>('/api/follow-up-plans/'),
  })

  const save = useMutation({
    mutationFn: (values: PlanFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        trigger: values.trigger,
        idle_hours: values.trigger === 'stalled' ? values.idle_hours : 0,
        create_agent_handoff: values.create_agent_handoff,
        handoff_title: values.create_agent_handoff
          ? values.handoff_title.trim()
          : '',
        is_active: values.is_active,
        steps: values.steps.map((s, idx) => ({
          order: idx + 1,
          offset_days: Number(s.offset_days) || 0,
          subject: s.subject.trim(),
          body: s.body.trim(),
        })),
      }
      if (editing) {
        return api<FollowUpPlan>(`/api/follow-up-plans/${editing.id}/`, {
          method: 'PATCH',
          json: payload,
        })
      }
      return api<FollowUpPlan>('/api/follow-up-plans/', { method: 'POST', json: payload })
    },
    onSuccess: (_data, _vars, _ctx) => {
      const wasEdit = Boolean(editing)
      qc.invalidateQueries({ queryKey: ['follow-up-plans'] })
      closeDialog()
      notifications.show({
        color: 'forest',
        message: wasEdit ? 'Plan updated' : 'Plan created',
      })
    },
    onError: (err: Error) =>
      notifications.show({ color: 'red', title: 'Could not save plan', message: err.message }),
  })

  const closeDialog = () => {
    close()
    setEditing(null)
    setActiveField(null)
    form.setValues(initialFormValues())
    form.clearErrors()
  }

  const openCreate = () => {
    setEditing(null)
    form.setValues(initialFormValues())
    form.clearErrors()
    setActiveField(null)
    open()
  }

  const openEdit = (plan: FollowUpPlan) => {
    setEditing(plan)
    form.setValues({
      name: plan.name,
      description: plan.description || '',
      trigger: plan.trigger,
      idle_hours: plan.idle_hours ?? 48,
      create_agent_handoff: plan.create_agent_handoff,
      handoff_title: plan.handoff_title || 'Call signer — stalled packet',
      is_active: plan.is_active,
      steps: (plan.steps || []).length
        ? [...plan.steps].sort((a, b) => a.order - b.order)
        : [blankStep(1, 0)],
    })
    form.clearErrors()
    setActiveField(null)
    open()
  }

  const updateStep = (index: number, patch: Partial<PlanStep>) => {
    const steps = form.values.steps.map((s, i) => (i === index ? { ...s, ...patch } : s))
    form.setFieldValue('steps', steps)
  }

  const addStep = () => {
    const steps = form.values.steps
    const lastOffset = steps.length ? steps[steps.length - 1].offset_days : 0
    form.setFieldValue('steps', [
      ...steps,
      blankStep(steps.length + 1, Math.min(lastOffset + 2, lastOffset + 14)),
    ])
  }

  const removeStep = (index: number) => {
    if (form.values.steps.length <= 1) {
      notifications.show({
        color: 'orange',
        message: 'A plan needs at least one email step',
      })
      return
    }
    form.setFieldValue(
      'steps',
      form.values.steps.filter((_, i) => i !== index),
    )
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= form.values.steps.length) return
    const steps = [...form.values.steps]
    ;[steps[index], steps[next]] = [steps[next], steps[index]]
    form.setFieldValue('steps', steps)
  }

  const insertToken = (token: string) => {
    const target = activeField ?? {
      index: Math.max(form.values.steps.length - 1, 0),
      field: 'body' as const,
    }
    const { index, field } = target
    const step = form.values.steps[index]
    if (!step) return
    if (field === 'subject') {
      const el = subjectRefs.current[index]
      const next = insertAtCursor(el, step.subject, token)
      updateStep(index, { subject: next })
    } else {
      const el = bodyRefs.current[index]
      const next = insertAtCursor(el, step.body, token)
      updateStep(index, { body: next })
    }
  }

  const handleSubmit = form.onSubmit((values) => {
    if (!values.steps.length) {
      notifications.show({ color: 'red', message: 'Add at least one email step' })
      return
    }
    save.mutate(values)
  })

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Follow-up plans</Title>
          <Text c="dimmed">
            Email sequences tied to envelope events. Attach a plan on an envelope before or after
            send.
          </Text>
        </div>
        <Button onClick={openCreate}>New plan</Button>
      </Group>

      {isLoading ? (
        <Text c="dimmed">Loading…</Text>
      ) : (data?.results || []).length === 0 ? (
        <Text c="dimmed">No follow-up plans yet.</Text>
      ) : (
        <DataTable>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Trigger</DataTable.Th>
              <DataTable.Th>Steps</DataTable.Th>
              <DataTable.Th>Agent handoff</DataTable.Th>
              <DataTable.Th>Status</DataTable.Th>
              <DataTable.Th className="sd-table-actions" />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {(data?.results || []).map((plan) => (
              <DataTable.Tr key={plan.id}>
                <DataTable.Td className="sd-table-primary">{plan.name}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  {TRIGGER_LABELS[plan.trigger]}
                  {plan.trigger === 'stalled' ? ` (${plan.idle_hours}h)` : ''}
                </DataTable.Td>
                <DataTable.Td>{plan.steps?.length ?? 0}</DataTable.Td>
                <DataTable.Td className="sd-table-muted">
                  {plan.create_agent_handoff ? 'Yes' : '—'}
                </DataTable.Td>
                <DataTable.Td>
                  <Badge variant="light" color={plan.is_active ? 'forest' : 'gray'}>
                    {plan.is_active ? 'Active' : 'Off'}
                  </Badge>
                </DataTable.Td>
                <DataTable.Td className="sd-table-actions">
                  <Button size="xs" variant="light" onClick={() => openEdit(plan)}>
                    Edit
                  </Button>
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
      )}

      <Modal
        opened={opened}
        onClose={closeDialog}
        title={
          <div>
            <Text fw={650} style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20 }}>
              {editing ? 'Edit follow-up plan' : 'New follow-up plan'}
            </Text>
            <Text size="sm" c="dimmed" fw={400}>
              Define when the sequence starts and what emails to send.
            </Text>
          </div>
        }
        size="xl"
        radius="lg"
        padding={0}
        styles={{
          header: { padding: '20px 24px 12px', alignItems: 'flex-start' },
          body: { padding: 0 },
        }}
      >
        <form onSubmit={handleSubmit}>
          <ScrollArea.Autosize mah="min(70vh, 720px)" type="auto" offsetScrollbars>
            <Stack gap="lg" px="xl" pb="md" pt="xs">
              <Box>
                <Text size="sm" fw={600} mb="sm">
                  Plan details
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Name"
                    placeholder="Buyer packet — stalled"
                    required
                    {...form.getInputProps('name')}
                  />
                  <TextInput
                    label="Description"
                    placeholder="Optional notes for your team"
                    {...form.getInputProps('description')}
                  />
                </SimpleGrid>
              </Box>

              <Box>
                <Text size="sm" fw={600} mb="xs">
                  Trigger
                </Text>
                <SegmentedControl
                  fullWidth
                  value={form.values.trigger}
                  onChange={(v) =>
                    form.setFieldValue('trigger', v as FollowUpPlan['trigger'])
                  }
                  data={[
                    { value: 'stalled', label: 'Stalled signer' },
                    { value: 'declined', label: 'Declined' },
                    { value: 'completed', label: 'Completed' },
                  ]}
                />
                <Text size="sm" c="dimmed" mt="xs">
                  {TRIGGER_HELP[form.values.trigger]}
                </Text>
                {form.values.trigger === 'stalled' ? (
                  <NumberInput
                    mt="md"
                    label="Idle hours before first email"
                    description="Time after the invite before day 0 of the plan"
                    min={0}
                    max={720}
                    {...form.getInputProps('idle_hours')}
                  />
                ) : null}
              </Box>

              <Box>
                <Text size="sm" fw={600} mb="sm">
                  After the sequence
                </Text>
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Switch
                      label="Create agent follow-up after the last email"
                      description="Adds an open task under Follow-ups for a phone call or personal outreach"
                      {...form.getInputProps('create_agent_handoff', { type: 'checkbox' })}
                    />
                    {form.values.create_agent_handoff ? (
                      <TextInput
                        label="Task title"
                        leftSection={<IconPhone size={16} />}
                        {...form.getInputProps('handoff_title')}
                      />
                    ) : null}
                    <Divider />
                    <Switch
                      label="Plan is active"
                      description="Inactive plans cannot be attached to new envelopes"
                      {...form.getInputProps('is_active', { type: 'checkbox' })}
                    />
                  </Stack>
                </Paper>
              </Box>

              <TimelinePreview
                steps={form.values.steps}
                idleHours={form.values.idle_hours}
                trigger={form.values.trigger}
                handoff={
                  form.values.create_agent_handoff
                    ? form.values.handoff_title.trim() || 'Agent task'
                    : null
                }
              />

              <Box>
                <Group justify="space-between" mb="sm" align="flex-end">
                  <div>
                    <Text size="sm" fw={600}>
                      Email steps
                    </Text>
                    <Text size="xs" c="dimmed">
                      Offset days are measured from plan start (after idle wait for stalled plans).
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={addStep}
                  >
                    Add step
                  </Button>
                </Group>

                <Stack gap="md">
                  {form.values.steps.map((step, index) => (
                    <Paper key={index} withBorder radius="md" p="md">
                      <Group justify="space-between" mb="sm" wrap="nowrap">
                        <Group gap="xs">
                          <IconMail size={16} stroke={1.5} />
                          <Text fw={600} size="sm">
                            Step {index + 1}
                          </Text>
                          <Badge variant="light" color="gray" tt="none">
                            Day {step.offset_days}
                          </Badge>
                        </Group>
                        <Group gap={4}>
                          <Tooltip label="Move up">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              disabled={index === 0}
                              onClick={() => moveStep(index, -1)}
                              aria-label="Move step up"
                            >
                              <IconArrowUp size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Move down">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              disabled={index === form.values.steps.length - 1}
                              onClick={() => moveStep(index, 1)}
                              aria-label="Move step down"
                            >
                              <IconArrowDown size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Remove step">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => removeStep(index)}
                              aria-label="Remove step"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>

                      <Stack gap="sm">
                        <NumberInput
                          label="Send on day"
                          description="Days after plan start"
                          min={0}
                          max={365}
                          value={step.offset_days}
                          onChange={(v) =>
                            updateStep(index, { offset_days: typeof v === 'number' ? v : 0 })
                          }
                          error={form.errors[`steps.${index}.offset_days`]}
                          w={{ base: '100%', sm: 180 }}
                        />
                        <TextInput
                          label="Subject"
                          placeholder="Still need a signature on {{envelope_title}}"
                          value={step.subject}
                          ref={(el) => {
                            subjectRefs.current[index] = el
                          }}
                          onFocus={() => setActiveField({ index, field: 'subject' })}
                          onChange={(e) => updateStep(index, { subject: e.currentTarget.value })}
                          error={form.errors[`steps.${index}.subject`]}
                        />
                        <Textarea
                          label="Body"
                          minRows={4}
                          autosize
                          maxRows={10}
                          placeholder="Hi {{recipient_name}}, …"
                          value={step.body}
                          ref={(el) => {
                            bodyRefs.current[index] = el
                          }}
                          onFocus={() => setActiveField({ index, field: 'body' })}
                          onChange={(e) => updateStep(index, { body: e.currentTarget.value })}
                          error={form.errors[`steps.${index}.body`]}
                        />
                        <PlaceholderChips onInsert={insertToken} />
                        {index === form.values.steps.length - 1 &&
                        form.values.create_agent_handoff ? (
                          <Group gap="xs" mt={4}>
                            <IconPhone size={14} />
                            <Text size="xs" c="dimmed">
                              Then creates follow-up:{' '}
                              <Text span fw={600} c="dark">
                                {form.values.handoff_title || 'Untitled task'}
                              </Text>
                            </Text>
                          </Group>
                        ) : null}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            </Stack>
          </ScrollArea.Autosize>

          <Group
            justify="space-between"
            px="xl"
            py="md"
            style={{
              borderTop: '1px solid rgba(16,42,35,0.08)',
              background: 'rgba(247,245,240,0.95)',
            }}
          >
            <Text size="xs" c="dimmed">
              {form.values.steps.length} step{form.values.steps.length === 1 ? '' : 's'}
              {form.values.create_agent_handoff ? ' · handoff task' : ''}
            </Text>
            <Group>
              <Button variant="default" type="button" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save changes' : 'Create plan'}
              </Button>
            </Group>
          </Group>
        </form>
      </Modal>
    </Stack>
  )
}
