/**
 * Extracts domain from a URL and returns a Clearbit logo URL
 * Clearbit Logo API is free and doesn't require authentication
 */
export function getCompanyLogoUrl(careerUrl: string | null | undefined): string | null {
  if (!careerUrl) return null;
  
  try {
    const url = new URL(careerUrl);
    let domain = url.hostname;
    
    // Remove common subdomains that might not have logos
    domain = domain.replace(/^(www\.|careers\.|jobs\.|werkenbij\.|career\.|job\.|werken\.)/, '');
    
    // Use Clearbit Logo API (free, no API key required)
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

/**
 * Fallback to Google's favicon service if Clearbit fails
 */
export function getCompanyFaviconUrl(careerUrl: string | null | undefined): string | null {
  if (!careerUrl) return null;
  
  try {
    const url = new URL(careerUrl);
    // Google's favicon service
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
  } catch {
    return null;
  }
}
