import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'

type CompanyOption = { id: number; name: string }

export function useCompaniesOptions() {
  const { data } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<{ results: CompanyOption[] }>('/api/companies/'),
  })
  return (data?.results || []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }))
}
