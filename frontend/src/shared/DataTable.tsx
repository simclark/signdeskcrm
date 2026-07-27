import { Table, type TableProps, type TableThProps, type TableTdProps } from '@mantine/core'
import type { ReactNode } from 'react'

type DataTableProps = TableProps & {
  children: ReactNode
  /** Skip the outer panel when already inside a Card. */
  embedded?: boolean
}

function DataTableRoot({ children, embedded = false, className, ...props }: DataTableProps) {
  const table = (
    <Table
      highlightOnHover
      verticalSpacing="md"
      horizontalSpacing="lg"
      className={['sd-table', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </Table>
  )

  if (embedded) return table
  return (
    <div className="sd-table-panel">
      <div className="sd-table-scroll">{table}</div>
    </div>
  )
}

export const DataTable = Object.assign(DataTableRoot, {
  Thead: Table.Thead,
  Tbody: Table.Tbody,
  Tr: Table.Tr,
  Th: Table.Th,
  Td: Table.Td,
  Caption: Table.Caption,
})

export type { TableThProps, TableTdProps }
