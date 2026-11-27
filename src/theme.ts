import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** Identidade (seção 11.5): verde escuro, verde natural, branco, cinza e azul discreto. */
const forest: MantineColorsTuple = [
  '#ecf7f1', '#d6ece0', '#a9d8bf', '#79c39c', '#52b17f', '#3a9a68', '#2b7f55', '#1d5c3f', '#154a32', '#0b3423',
];
const slateBlue: MantineColorsTuple = [
  '#eef3f9', '#dbe4ef', '#b3c7df', '#88a8ce', '#658ebf', '#4f7db6', '#4374b3', '#34629d', '#2b578d', '#1e4b7e',
];

export const theme = createTheme({
  primaryColor: 'forest',
  primaryShade: { light: 7, dark: 5 },
  colors: { forest, slateBlue },
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: '650' },
  defaultRadius: 'md',
  components: {
    TextInput: { defaultProps: { radius: 'md' } },
    Button: { defaultProps: { radius: 'md' } },
  },
});
