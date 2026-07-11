import { Button, Group, Stack, Table, Text, Title, FileButton } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { notifications } from '@mantine/notifications'

type Document = {
  id: number
  title: string
  original_filename: string
  current_version?: { page_count: number; sha256: string }
  created_at: string
}

export function DocumentsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ results: Document[] }>('/api/documents/'),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.pdf$/i, ''))
      return api('/api/documents/', { method: 'POST', formData: fd })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      notifications.show({ color: 'forest', message: 'Document uploaded' })
    },
  })

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Documents</Title>
          <Text c="dimmed">Upload PDFs to use in envelopes.</Text>
        </div>
        <FileButton onChange={(f) => f && upload.mutate(f)} accept="application/pdf">
          {(props) => (
            <Button {...props} loading={upload.isPending}>
              Upload PDF
            </Button>
          )}
        </FileButton>
      </Group>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Pages</Table.Th>
            <Table.Th>Uploaded</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.results || []).map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td>{d.title}</Table.Td>
              <Table.Td>{d.current_version?.page_count ?? '—'}</Table.Td>
              <Table.Td>{new Date(d.created_at).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}
