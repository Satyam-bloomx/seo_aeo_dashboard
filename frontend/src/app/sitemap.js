export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://auditpro.ai';
  const lastModified = new Date().toISOString();

  return [
    {
      url: baseUrl,
      lastModified: lastModified,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/loading-demo`,
      lastModified: lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
