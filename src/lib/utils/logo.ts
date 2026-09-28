/** Prefer the employer's own favicon and avoid third-party tracking/logo services. */
export function getCompanyLogoUrl(careerUrl: string | null | undefined): string | null {
  if (!careerUrl) return null;
  
  try {
    const url = new URL(careerUrl);
    return `${url.protocol}//${url.hostname}/favicon.ico`;
  } catch {
    return null;
  }
}

/** There is no external fallback; the card renders a local generic icon on failure. */
export function getCompanyFaviconUrl(careerUrl: string | null | undefined): string | null {
  void careerUrl;
  return null;
}
