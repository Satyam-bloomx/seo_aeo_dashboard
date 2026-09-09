// Comprehensive diagnostic rule engine replicating Screaming Frog, AEO and GEO standards.
// Evaluates pages and produces actionable issues with root causes, search impacts, and fixes.

export const RULE_METADATA = {
  'Response Codes: Client Error (4xx)': {
    rootCause: 'The server returned a 4xx HTTP status (such as 404 Not Found or 403 Forbidden). This happens when internal links point to deleted, moved, or misspelled URLs without appropriate redirect headers.',
    impact: 'Wastes crawler budget, causes broken user navigation experiences, drops link equity (PageRank), and triggers soft penalties in search indexing.',
    fixGuide: 'Locate internal inlinks pointing to these broken URLs. Either restore the missing resource or update the link to a live destination or implement a permanent 301 redirect.'
  },
  'Response Codes: Server Error (5xx)': {
    rootCause: 'The web server encountered an unhandled exception or gateway timeout (such as 500, 502, 503, or 504) while processing the page request.',
    impact: 'Search engine bots cannot render or index the page content. Persistent 5xx errors cause complete de-indexing from Google SERPs.',
    fixGuide: 'Review backend server logs and application error tracing (e.g. Sentry/Datadog) to resolve crashes, database connection timeouts, or reverse proxy gateway errors.'
  },
  'Page Titles: Missing': {
    rootCause: 'The HTML document does not contain a <title> tag inside the <head> element, or the tag is completely blank.',
    impact: 'Search engines generate arbitrary snippet headlines in search results, reducing click-through rates (CTR) and weakening topical relevance signals.',
    fixGuide: 'Add a unique, keyword-optimized <title> tag inside the <head> section of the page template.'
  },
  'Page Titles: Duplicate': {
    rootCause: 'Multiple distinct URLs share the exact same <title> tag string. Often caused by boilerplate template headers, paginated archives, or un-canonicalized parameter variations.',
    impact: 'Causes keyword cannibalization where search engines struggle to determine which page is the primary authority for target queries.',
    fixGuide: 'Customize title tags for each page with specific topic keywords and product/service names, keeping brand suffix consistent.'
  },
  'Page Titles: Over 60 Characters': {
    rootCause: 'The page title string exceeds the standard 60-character desktop/mobile display threshold (approx. 580 pixels).',
    impact: 'Search engine SERPs will truncate the title with ellipses (...), cutting off brand messaging or key conversion call-to-actions.',
    fixGuide: 'Shorten the title tag to between 30 and 60 characters while keeping the most critical keyword near the beginning.'
  },
  'Page Titles: Below 30 Characters': {
    rootCause: 'The title tag is excessively brief (e.g. "Home" or "Services") and lacks topical context.',
    impact: 'Underutilizes precious search ranking real estate and fails to inform users or AI crawlers about the page context.',
    fixGuide: 'Expand title to 45–60 characters by including primary keyword, secondary modifier, and brand name.'
  },
  'Page Titles: Multiple': {
    rootCause: 'The HTML contains more than one <title> element inside the DOM. This frequently occurs when CMS plugins inject additional title tags without cleaning template defaults.',
    impact: 'Search engine crawlers face ambiguity and may arbitrarily pick an unintended title tag for search snippets.',
    fixGuide: 'Audit header templates and SEO plugin configurations to ensure only a single <title> tag is rendered.'
  },
  'Page Titles: Outside <head>': {
    rootCause: 'A <title> tag is placed inside the <body> element or after the closing </head> tag.',
    impact: 'Violates HTML5 W3C standards and modern browser parsing rules, causing crawlers to ignore or misinterpret the title.',
    fixGuide: 'Relocate the <title> tag strictly inside the <head>...</head> container.'
  },
  'Page Titles: Same as H1': {
    rootCause: 'The <title> tag text is verbatim identical to the primary <h1> heading text.',
    impact: 'Misses the opportunity to rank for semantic synonyms or long-tail keyword variations across SERP headlines and on-page headings.',
    fixGuide: 'Differentiate your <title> (SERP click-focused with brand suffix) from your <h1> (on-page conversion and topical depth).'
  },
  'Meta Description: Missing': {
    rootCause: 'No <meta name="description" content="..."> tag was found in the page <head>.',
    impact: 'Search engines will automatically generate snippets from random body text, often displaying disjointed copy that degrades click-through rates.',
    fixGuide: 'Craft a compelling meta description between 120 and 155 characters that includes primary keywords and a clear call-to-action.'
  },
  'Meta Description: Duplicate': {
    rootCause: 'Multiple pages have identical meta description content strings, typically due to hardcoded sitewide header templates.',
    impact: 'Diminishes uniqueness across indexed URLs and may lead search engines to disregard the provided descriptions in SERP snippets.',
    fixGuide: 'Implement dynamic meta description templates in your CMS or framework that generate page-specific summaries.'
  },
  'Meta Description: Over 155 Characters': {
    rootCause: 'Meta description length exceeds Google\'s mobile and desktop display limit (~960px / 155–160 characters).',
    impact: 'The snippet will be truncated with ellipses (...), potentially cutting off the value proposition or call-to-action.',
    fixGuide: 'Edit meta descriptions to remain between 120 and 155 characters for optimal snippet presentation across all devices.'
  },
  'Meta Description: Below 70 Characters': {
    rootCause: 'The meta description is too brief to provide a substantive summary of page contents.',
    impact: 'Provides insufficient context to search engines and AI summary agents, leading to auto-generated snippet overrides.',
    fixGuide: 'Expand description to at least 120 characters with persuasive, keyword-rich copy.'
  },
  'Meta Description: Multiple': {
    rootCause: 'More than one <meta name="description"> tag is present in the document.',
    impact: 'Causes unpredictable snippet generation as bots may read the wrong description or disregard both.',
    fixGuide: 'Remove duplicate meta description declarations from themes or competing SEO plugins.'
  },
  'Meta Description: Outside <head>': {
    rootCause: 'The meta description tag appears inside the <body> tag or outside the valid <head> tree.',
    impact: 'HTML parser violations may prevent search engine robots from reading the directive.',
    fixGuide: 'Ensure meta description tags are placed inside the <head> block.'
  },
  'H1: Missing': {
    rootCause: 'The page HTML does not contain any <h1> heading tag in the document body.',
    impact: 'Deprives search engines and AI extractors (ChatGPT, Perplexity) of the primary hierarchical topic indicator.',
    fixGuide: 'Add a single, prominent <h1> tag to the top of the main content area summarizing the core topic.'
  },
  'H1: Multiple': {
    rootCause: 'The page contains two or more <h1> tags in the DOM. Frequently caused by site logos, banners, or widgets using <h1> alongside the main page title.',
    impact: 'Dilutes topical focus and confuses heading hierarchy for accessibility screen readers and semantic indexing engines.',
    fixGuide: 'Reserve <h1> strictly for the primary article/page headline. Demote secondary headlines or logo wrappers to <h2>, <h3>, or <div> elements.'
  },
  'H1: Duplicate': {
    rootCause: 'Multiple distinct URLs on the site share the exact same <h1> heading text.',
    impact: 'Signals potential duplicate or thin content across multiple URLs to search engines.',
    fixGuide: 'Make each page <h1> unique and specific to the contents of that exact URL.'
  },
  'H1: Over 70 Characters': {
    rootCause: 'The <h1> heading text is unusually long, resembling a paragraph rather than a concise headline.',
    impact: 'Weakens heading clarity and topical punch for readers and algorithms.',
    fixGuide: 'Condense the <h1> into a punchy, focused headline under 70 characters.'
  },
  'H1: Non-Sequential': {
    rootCause: 'Heading hierarchy skips levels (e.g. <h3> or <h4> appears before or immediately after <h1> without an intermediate <h2>).',
    impact: 'Degrades accessibility compliance (WCAG) and makes document outline parsing harder for AI agents.',
    fixGuide: 'Structure headings in logical sequence: <h1> -> <h2> -> <h3>.'
  },
  'H2: Missing': {
    rootCause: 'The page has an <h1> but no secondary <h2> subheadings in the content body.',
    impact: 'Long-form content without subheadings is harder to skim for users and reduces opportunities for secondary keyword ranking.',
    fixGuide: 'Break up content sections with descriptive <h2> subheadings.'
  },
  'H2: Duplicate': {
    rootCause: 'The same <h2> heading is repeated multiple times on the same page.',
    impact: 'May reflect redundant sections or boilerplate text within the content.',
    fixGuide: 'Make each <h2> heading distinct and representative of its respective subtopic.'
  },
  'Content: Exact Duplicates': {
    rootCause: 'Two or more URLs share 100% identical body content hashes (e.g. HTTP vs HTTPS, trailing slash variants, or identical page clones).',
    impact: 'Severe crawl budget waste, diluted link equity, and search engine filter suppression of duplicate URLs.',
    fixGuide: 'Set proper canonical tags, configure 301 redirects, or consolidate duplicate pages into a single authoritative URL.'
  },
  'Content: Near Duplicates': {
    rootCause: 'Pages share 90%+ overlapping text with only minor template or parameter changes.',
    impact: 'Lowers site quality scores under Google\'s helpful content and Panda algorithms.',
    fixGuide: 'Add unique value, differentiate copy, or add noindex / canonical directives to secondary variants.'
  },
  'Content: Low Content Pages': {
    rootCause: 'Page contains fewer than 200 words of body copy, classified as thin content.',
    impact: 'Search engines deprioritize thin pages from indexing and AI answer engines cannot extract authoritative answers.',
    fixGuide: 'Expand content with substantive, helpful information, FAQs, and data, or noindex utility pages.'
  },
  'Content: Soft 404 Pages': {
    rootCause: 'The page displays a "Not Found" or empty message to users but returns an HTTP 200 OK status to search engines.',
    impact: 'Search engines waste crawl budget indexing empty pages, which hurts domain quality metrics.',
    fixGuide: 'Configure server to return an HTTP 404 or 410 status code for non-existent pages.'
  },
  'Content: Lorem Ipsum Placeholder': {
    rootCause: 'Unpublished staging or template placeholder text ("Lorem Ipsum") was detected in the live production DOM.',
    impact: 'Severely damages brand trust, professionalism, and indexing quality.',
    fixGuide: 'Replace all placeholder copy with finalized, reviewed production content.'
  },
  'Validation: Multiple <body> Tags': {
    rootCause: 'The HTML document contains multiple <body> opening tags, often caused by conflicting CMS plugins or misconfigured layout wrappers.',
    impact: 'Causes DOM tree invalidation in browsers and search engine renderers, breaking script execution and layout styling.',
    fixGuide: 'Inspect page templates and server layout files to ensure only one <body> opening and closing tag is rendered per page.'
  },
  'Validation: Missing <head> Tag': {
    rootCause: 'The document lacks a valid <head> opening tag, placing metadata directly in the root or body.',
    impact: 'Browsers and bots must guess head boundaries, often failing to execute scripts or parse meta tags.',
    fixGuide: 'Add a standard <!DOCTYPE html><html><head>...</head><body>...</body></html> structure.'
  },
  'Validation: Multiple <head> Tags': {
    rootCause: 'Multiple <head> tags appear in the HTML document.',
    impact: 'May cause metadata in secondary head blocks to be completely ignored by web crawlers.',
    fixGuide: 'Consolidate all meta, script, and link elements into a single <head> element.'
  },
  'Validation: Missing <body> Tag': {
    rootCause: 'The document does not have a <body> tag wrapping visible content.',
    impact: 'Violates W3C standards and impairs DOM parsing in search engines.',
    fixGuide: 'Wrap all visible markup inside a single <body>...</body> container.'
  },
  'Validation: HTML Document Over 2MB': {
    rootCause: 'The raw uncompressed HTML payload exceeds 2 megabytes, usually due to inlined Base64 images, massive SVGs, or bloated JSON state.',
    impact: 'Slows down initial page load (TTFB/FCP), increases hosting costs, and may cause mobile crawlers to truncate rendering.',
    fixGuide: 'Externalize scripts and styles, move inline Base64 images to CDN assets, and streamline SSR payload data.'
  },
  'Canonicals: Missing': {
    rootCause: 'The page does not declare a <link rel="canonical" href="..."> element.',
    impact: 'Leaves the URL vulnerable to duplicate content issues from query parameters, tracking tags, and protocol variations.',
    fixGuide: 'Add a self-referential canonical link element to every indexable page.'
  },
  'Canonicals: Multiple': {
    rootCause: 'More than one <link rel="canonical"> tag was found in the page.',
    impact: 'Search engines ignore all conflicting canonical tags when multiple exist, defeating canonicalization entirely.',
    fixGuide: 'Ensure exactly one canonical link element is rendered per page.'
  },
  'Canonicals: Canonical Is Relative': {
    rootCause: 'The canonical tag uses a relative URL (e.g. href="/about") instead of an absolute URL (e.g. href="https://example.com/about").',
    impact: 'Can lead to crawler confusion and incorrect resolution across subdomains or protocols.',
    fixGuide: 'Always specify full absolute canonical URLs including protocol (https://) and domain.'
  },
  'Images: Missing Alt Text': {
    rootCause: 'Images contain an alt attribute that is blank or empty (alt="").',
    impact: 'Screen readers cannot describe images to visually impaired users, and search engines cannot index images in Google Images search.',
    fixGuide: 'Provide descriptive, context-specific alt text for all informational images.'
  },
  'Images: Missing Alt Attribute': {
    rootCause: '<img> tags completely lack the alt attribute altogether.',
    impact: 'Fails WCAG 2.1 accessibility compliance and triggers SEO validation warnings.',
    fixGuide: 'Add alt attributes to all <img> tags across templates and CMS media libraries.'
  },
  'Security: HTTP URLs': {
    rootCause: 'The crawler detected insecure http:// URLs being served or linked on an https:// domain.',
    impact: 'Causes mixed-content security warnings in modern browsers and loses Google HTTPS ranking preference.',
    fixGuide: 'Enforce sitewide HTTPS via 301 redirects and update all internal asset and link URLs to https://.'
  },
  'JavaScript: Pages with JavaScript Errors': {
    rootCause: 'Uncaught JavaScript runtime errors or console exceptions were thrown during browser page rendering.',
    impact: 'Can break client-side interactivity, dynamic content rendering, and client-side routing for users and bots.',
    fixGuide: 'Debug browser console logs and fix syntax errors, undefined variable references, or failed API calls.'
  }
};

const CATEGORY_CONFIGS = {
  Page_Titles: { 
    'Missing': 'Issue', 'Duplicate': 'Issue', 'Over 60 Characters': 'Warning', 
    'Below 30 Characters': 'Opportunity', 'Multiple': 'Issue', 'Outside <head>': 'Issue',
    'Same as H1': 'Opportunity'
  },
  Meta_Description: { 
    'Missing': 'Issue', 'Duplicate': 'Issue', 'Over 155 Characters': 'Warning', 
    'Below 70 Characters': 'Opportunity', 'Multiple': 'Issue', 'Outside <head>': 'Issue'
  },
  H1: { 
    'Missing': 'Issue', 'Duplicate': 'Warning', 'Over 70 Characters': 'Opportunity', 
    'Multiple': 'Issue', 'Non-Sequential': 'Warning', 'Alt Text in H1': 'Opportunity'
  },
  H2: {
    'Missing': 'Warning', 'Duplicate': 'Opportunity', 'Over 70 Characters': 'Opportunity', 
    'Multiple': 'Opportunity', 'Non-Sequential': 'Warning'
  },
  Content: {
    'Exact Duplicates': 'Issue', 'Near Duplicates': 'Warning', 'Low Content Pages': 'Warning',
    'Soft 404 Pages': 'Issue', 'Readability Difficult': 'Opportunity', 'Readability Very Difficult': 'Warning',
    'Lorem Ipsum Placeholder': 'Issue'
  },
  Images: {
    'Missing Alt Text': 'Warning', 'Missing Alt Attribute': 'Warning', 
    'Alt Text Over 100 Characters': 'Opportunity', 'Missing Size Attributes': 'Opportunity'
  },
  Canonicals: {
    'Missing': 'Warning', 'Multiple': 'Issue', 'Multiple Conflicting': 'Issue',
    'Canonical Is Relative': 'Warning', 'Outside <head>': 'Issue'
  },
  Directives: {
    'Outside <head>': 'Issue'
  },
  Validation: {
    'Missing <head> Tag': 'Issue', 'Multiple <head> Tags': 'Issue', 
    'Missing <body> Tag': 'Issue', 'Multiple <body> Tags': 'Issue',
    'HTML Document Over 2MB': 'Warning'
  },
  JavaScript: {
    'Pages with Blocked Resources': 'Warning', 'Pages with JavaScript Errors': 'Issue',
    'Uses Old AJAX Crawling Scheme URLs': 'Opportunity'
  },
  Security: {
    'HTTP URLs': 'Issue'
  }
};

const RULES = [
  {
    name: 'Response Codes: Client Error (4xx)',
    ruleName: 'Client Error (4xx)',
    category: 'Response_Codes',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => page.status_code >= 400 && page.status_code < 500
  },
  {
    name: 'Response Codes: Server Error (5xx)',
    ruleName: 'Server Error (5xx)',
    category: 'Response_Codes',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => page.status_code >= 500
  }
];

// Dynamically inject rules based on the configs
Object.entries(CATEGORY_CONFIGS).forEach(([category, rulesMap]) => {
  Object.entries(rulesMap).forEach(([ruleName, type]) => {
     let priority = 'Medium';
     if (type === 'Issue') priority = 'High';
     if (type === 'Warning') priority = 'High';
     
     const fullName = `${category.replace(/_/g, ' ')}: ${ruleName}`;
     const meta = RULE_METADATA[fullName] || {};

     RULES.push({
         name: fullName,
         ruleName: ruleName,
         category: category,
         type: type,
         priority: priority,
         rootCause: meta.rootCause || `Condition '${ruleName}' was triggered based on audit data for ${category.replace(/_/g, ' ')}.`,
         impact: meta.impact || `Affects technical health, crawlability, and indexing performance in search engines.`,
         fixGuide: meta.fixGuide || `Audit and update page templates to resolve ${ruleName} for affected URLs.`,
         evaluate: (page) => {
             const val = page.audit_data?.[category]?.[ruleName];
             return val === true;
         }
     });
  });
});

export function generateIssuesReport(pages) {
  if (!pages || pages.length === 0) return [];
  const report = RULES.map(rule => {
    const meta = RULE_METADATA[rule.name] || {};
    return {
      ...rule,
      rootCause: rule.rootCause || meta.rootCause || 'Diagnostic rule condition detected by the crawler.',
      impact: rule.impact || meta.impact || 'Impairs search engine ranking, indexation, or user experience.',
      fixGuide: rule.fixGuide || meta.fixGuide || 'Review affected URLs and resolve template/server configurations.',
      affected_pages: [],
      count: 0,
      percentage: 0
    };
  });

  pages.forEach(page => {
    report.forEach(rule => {
      if (rule.evaluate(page)) {
        rule.affected_pages.push(page);
        rule.count++;
      }
    });
  });

  const totalPages = pages.length;
  
  const activeIssues = report
    .filter(r => r.count > 0)
    .map(r => ({
      ...r,
      percentage: ((r.count / totalPages) * 100).toFixed(2)
    }))
    .sort((a, b) => {
      const typeRank = { 'Issue': 3, 'Warning': 2, 'Opportunity': 1 };
      if (typeRank[a.type] !== typeRank[b.type]) {
        return typeRank[b.type] - typeRank[a.type];
      }
      return b.count - a.count;
    });

  return activeIssues;
}
