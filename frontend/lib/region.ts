export const getRegion = (): string => {
  if (typeof window === 'undefined') return 'us-east-1'
  return localStorage.getItem('selected_region') || process.env.NEXT_PUBLIC_REGION || 'us-east-1'
}

export const setRegion = (region: string): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem('selected_region', region)
  window.dispatchEvent(new Event('region-changed'))
}