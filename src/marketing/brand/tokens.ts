/** Public-site brand tokens. Authenticated application theming is intentionally separate. */
export const myDesckBrandTokens = {
  color: {
    surface: '#ffffff',
    surfaceSoft: '#f6f9fc',
    surfaceStrong: '#eaf2f8',
    primary: '#0b527d',
    primaryHover: '#083d5e',
    secondary: '#1d3342',
    success: '#047857',
    warning: '#9a5b08',
    danger: '#be123c',
    text: '#0c1c2c',
    muted: '#526174',
    border: '#dce5ec',
  },
  gradient: {
    hero: 'linear-gradient(145deg, #f8fbfd 0%, #edf6fb 48%, #f8fafc 100%)',
    signature: 'linear-gradient(135deg, #0b527d 0%, #087c8d 100%)',
  },
  radius: { sm: '0.625rem', md: '0.875rem', lg: '1.25rem', xl: '1.75rem' },
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem', section: '5rem' },
  shadow: { card: '0 1px 2px rgba(12, 28, 44, 0.05)', elevated: '0 24px 64px rgba(12, 28, 44, 0.14)' },
} as const;
