import { Button, Group, Stack, Text, Title, FileButton } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { DataTable } from '../../shared/DataTable'
import { formatDate } from '../../shared/formatDate'
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
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Title</DataTable.Th>
            <DataTable.Th className="sd-table-numeric">Pages</DataTable.Th>
            <DataTable.Th>Uploaded</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {(data?.results || []).map((d) => (
            <DataTable.Tr key={d.id}>
              <DataTable.Td className="sd-table-primary">{d.title}</DataTable.Td>
              <DataTable.Td className="sd-table-numeric sd-table-muted">
                {d.current_version?.page_count ?? '—'}
              </DataTable.Td>
              <DataTable.Td className="sd-table-muted">{formatDate(d.created_at, true)}</DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>
    </Stack>
  )
}
