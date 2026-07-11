import { createTheme, type MantineColorsTuple } from '@mantine/core'

const forest: MantineColorsTuple = [
  '#eaf7f1',
  '#d2ebe0',
  '#a6d7c2',
  '#75c2a1',
  '#4faf86',
  '#36a375',
  '#0b6e4f',
  '#095c42',
  '#074b36',
  '#043926',
]

export const theme = createTheme({
  primaryColor: 'forest',
  colors: { forest },
  fontFamily: '"DM Sans", system-ui, sans-serif',
  headings: {
    fontFamily: '"Fraunces", Georgia, serif',
    fontWeight: '650',
  },
  defaultRadius: 'md',
  primaryShade: 6,
  other: {
    brandName: 'SignDesk',
  },
})
