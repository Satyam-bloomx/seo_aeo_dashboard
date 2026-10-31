// Comprehensive diagnostic rule engine replicating Screaming Frog, AEO and GEO standards.
// Evaluates pages and produces actionable issues with root causes, search impacts, and fixes.

export const RULE_METADATA = {
  'Response Codes: Redirect Chain (2+ Hops)': {
    rootCause: 'This URL redirects more than once before reaching its final destination (for example http -> https -> trailing slash).',
    impact: 'Every extra hop adds latency and an extra fetch for crawlers; long chains can stop Googlebot from following through.',
    fixGuide: 'Point the first URL (and every internal link to it) directly at the final destination so there is a single redirect at most.',
    exampleBefore: '/old-page -> /old-page/ -> /new-page/',
    exampleAfter: '/old-page -> /new-page/ (one 301)',
  },
  'Response Codes: Temporary Redirect (302/307)': {
    rootCause: 'This URL uses a temporary redirect, which tells search engines the move is not permanent.',
    impact: 'Search engines may keep the old URL indexed and consolidate signals more slowly than with a permanent redirect.',
    fixGuide: 'If the move is permanent, change the redirect to 301 (or 308) in your server, CDN or redirect plugin.',
  },
  'Response Codes: Blocked or Failed (No Response)': {
    rootCause: 'The crawler received no HTTP response for this URL: it was disallowed by robots.txt, the connection failed or timed out, or the address points to a non-public network.',
    impact: 'Search engines cannot fetch these URLs either, so any content or links on them are invisible.',
    fixGuide: 'Check the reason recorded for the URL. If robots.txt blocks a page you want indexed, allow it; if the server timed out or refused the connection, fix hosting or firewall rules.',
    tip: 'Status 0 is the standard way SEO crawlers report a URL that returned no response.'
  },
  'Links: Internal Links To Broken Pages': {
    rootCause: 'This page links to one or more internal URLs that return 4xx/5xx or no response.',
    impact: 'Visitors hit dead ends and crawlers waste budget on broken URLs; link equity flowing through those links is lost.',
    fixGuide: 'Open the page, find links to the broken URLs (see the URL inspector inlinks), and point them at a live destination or remove them.',
    tip: 'Fix broken links in shared templates (header, footer, sidebar) first: one edit repairs every page.'
  },
  'Links: Internal Links To Redirects': {
    rootCause: 'This page links to internal URLs that redirect (3xx) instead of linking to the final destination.',
    impact: 'Each redirect adds latency for users and an extra fetch for crawlers.',
    fixGuide: 'Update the links to the redirect target URL directly.',
  },
  'Structured Data: Invalid JSON-LD': {
    rootCause: 'A <script type="application/ld+json"> block on the page is not valid JSON, so search engines discard it.',
    impact: 'The page loses eligibility for the rich results that markup was meant to provide.',
    fixGuide: 'Validate the block in the Google Rich Results Test or Schema Markup Validator, fix the syntax error (often a trailing comma or unescaped quote), and redeploy.',
    tip: 'SEO plugins (Yoast, Rank Math) output valid JSON-LD; invalid blocks usually come from hand-written theme snippets.'
  },
  'Structured Data: Product Pages Missing Product Schema': {
    rootCause: 'These product pages have no Product structured data (JSON-LD with name, price, availability).',
    impact: 'Without it, Google cannot show price, stock and review stars in search results or Shopping, and AI answers have less to quote.',
    fixGuide: 'Add Product JSON-LD with name, image, offers (price, currency, availability) to the product page template; most store platforms and SEO plugins can output it.',
    exampleBefore: '<!-- no structured data on the product page -->',
    exampleAfter: '<script type="application/ld+json">{"@type":"Product","name":"...","offers":{"@type":"Offer","price":"51.77","priceCurrency":"GBP","availability":"https://schema.org/InStock"}}</script>',
    tip: 'Validate one product URL in the Google Rich Results Test after adding it.'
  },
  'Pagination: Paginated Page Canonicalised To First Page': {
    rootCause: 'Page 2, 3... of a listing point their canonical tag at page 1.',
    impact: 'Google may drop pages 2+ from its index, so products or posts linked only from those pages are found more slowly.',
    fixGuide: 'Give each paginated page a self-referencing canonical (page 2 points to page 2).',
    exampleBefore: '<!-- on /blog/page/2/ --> <link rel="canonical" href="https://site.com/blog/" />',
    exampleAfter: '<!-- on /blog/page/2/ --> <link rel="canonical" href="https://site.com/blog/page/2/" />',
    tip: 'Google stopped using rel=prev/next; self-canonicals plus normal links are its current advice.'
  },
  'Pagination: Duplicate Title From Pagination': {
    rootCause: 'Pages of the same listing (page 1, 2, 3...) share one title.',
    impact: 'Minor: search results cannot tell the pages apart. This is common and low priority.',
    fixGuide: 'Add the page number to the title of pages 2+ (for example "Mystery Books - Page 2").',
    exampleBefore: '<title>Mystery | Books</title> (on every page of the category)',
    exampleAfter: '<title>Mystery | Books - Page 2</title>',
    tip: 'Most themes have a setting for paginated titles.'
  },
  'Directives: Noindex': {
    rootCause: 'These pages tell search engines not to index them (meta robots or X-Robots-Tag noindex).',
    impact: 'They will not appear in Google. That is correct for thank-you, cart or internal pages, and a serious mistake on pages you want found.',
    fixGuide: 'Check the list: remove noindex from any page that should rank (often a leftover from a staging site or an SEO plugin setting).',
    exampleBefore: '<meta name="robots" content="noindex">',
    exampleAfter: '<meta name="robots" content="index, follow"> (or remove the tag)',
    tip: 'This is informational and barely affects the score.'
  },
  'Structured Data: Missing Structured Data': {
    rootCause: 'No JSON-LD, microdata or RDFa schema was found on this page.',
    impact: 'Search and AI answer engines have less explicit context about the page, and it cannot qualify for rich results.',
    fixGuide: 'Add schema that matches the page type (Organization on the homepage, Article on posts, Product on product pages, BreadcrumbList site-wide).',
  },
  'Canonicals: Non-Indexable Canonical': {
    rootCause: 'The canonical tag points to a URL that is not indexable (error, redirect, or noindex).',
    impact: 'Google may ignore the canonical or drop both pages from the index.',
    fixGuide: 'Point the canonical at the live, indexable version of the page (usually the page itself).',
  },
  'Response Codes: Redirection (3xx)': {
    rootCause: 'This page redirects to a different URL (HTTP 301 or 302). Internal links on your site are still pointing to the old address instead of linking directly to the final destination.',
    impact: 'Redirects add 150–300ms of lag for users, waste search engine crawl quota, and can dilute link equity over time.',
    fixGuide: 'Update internal links across your navigation, footer, and page copy to point straight to the destination URL without redirect hops.',
    exampleBefore: 'Internal link points to: "http://yourdomain.com/about" (Redirects 301 to "https://yourdomain.com/about/")',
    exampleAfter: 'Update link directly to: "https://yourdomain.com/about/"',
    tip: 'Direct internal links load noticeably faster and give Googlebot a clean, single-hop path.'
  },
  'Response Codes: Client Error (4xx)': {
    rootCause: 'A link on your site points to a page that no longer exists (404 Not Found) or requires authentication (403 Forbidden).',
    impact: 'Visitors encounter frustrating dead ends, and Googlebot marks the broken links as poor site maintenance, hurting user trust and crawl health.',
    fixGuide: 'Locate where this broken URL is linked. Either restore the page, update the link to a live relevant page, or set up a 301 redirect.',
    exampleBefore: 'Internal link points to: "/summer-sale-2023" (Returns 404 Not Found)',
    exampleAfter: 'Update link to: "/deals" or 301 redirect "/summer-sale-2023" to "/deals"',
    tip: 'Never leave broken links in your main navigation, footer, or high-traffic landing pages.'
  },
  'Response Codes: Server Error (5xx)': {
    rootCause: 'Your web server crashed or timed out (500 Internal Error, 502 Bad Gateway, 503 Service Unavailable) while loading this page.',
    impact: 'Search engines cannot crawl or index the page. If 5xx errors persist for more than a few days, Google will completely remove the page from search results.',
    fixGuide: 'Check backend application logs and server resource monitors (CPU, memory, database timeouts) to fix uncaught exceptions or reverse-proxy timeouts.',
    exampleBefore: 'Server returns: 500 Internal Server Error (Database connection timed out)',
    exampleAfter: 'Server returns: 200 OK (Clean page response rendered in < 300ms)',
    tip: 'Set up automated uptime alerts so you are notified immediately when a 500 error occurs.'
  },
  'Page Titles: Missing': {
    rootCause: 'This page has no <title> tag declared inside its <head> section, or the title tag is completely empty.',
    impact: 'Google has to invent a title by pulling random text from your page, resulting in confusing, low-click search listings.',
    fixGuide: 'Add a clear, unique <title> tag between 40 and 60 characters that tells searchers what the page is about.',
    exampleBefore: 'HTML: <head> (No <title> tag found) </head>',
    exampleAfter: 'HTML: <title>Custom Software Engineering & Cloud Solutions | BestPeers</title>',
    tip: 'The <title> tag is your #1 on-page SEO element. Treat it like your headline billboard in Google.'
  },
  'Page Titles: Duplicate': {
    rootCause: 'Multiple distinct pages on your website share the exact same title tag.',
    impact: 'Causes keyword cannibalization: Google doesn\'t know which of your pages is the main authority, so your pages compete against each other and both rank lower.',
    fixGuide: 'Give every single page a distinct, descriptive title that reflects its unique contents or product name.',
    exampleBefore: 'Page A Title: "Shop Online | MyBrand"\nPage B Title: "Shop Online | MyBrand"',
    exampleAfter: 'Page A Title: "Men\'s Waterproof Hiking Boots | MyBrand"\nPage B Title: "Women\'s Lightweight Trail Shoes | MyBrand"',
    tip: 'If using a CMS, configure your page templates to automatically append the product or post name: "{{ page.title }} | {{ site.name }}".'
  },
  'Page Titles: Over 60 Characters': {
    rootCause: 'The page title is too long (over 60 characters / ~580 pixels), exceeding the display space available in Google search results.',
    impact: 'Google will truncate your title with ellipses ("..."), chopping off your call to action, key selling points, or brand name.',
    fixGuide: 'Shorten the title to between 45 and 60 characters. Place your most critical target keyword at the beginning, followed by a secondary benefit and brand suffix.',
    exampleBefore: 'Title: "Custom Web Application & Mobile Software Development Company Delivering Enterprise Cloud Apps In New York | Agency" (116 chars)',
    exampleAfter: 'Title: "Custom Web & Mobile Software Development | Agency NYC" (52 chars)',
    tip: 'Keep the core keyword in the first 40 characters so it is guaranteed to show on small mobile screens.'
  },
  'Page Titles: Below 30 Characters': {
    rootCause: 'The page title is too brief (under 30 characters) and doesn\'t provide enough context about what the page offers.',
    impact: 'Short, generic titles like "Home", "About", or "Services" miss out on high-intent search traffic and fail to attract clicks.',
    fixGuide: 'Expand the title to 45–60 characters by adding your primary keyword, service specialty, or target audience alongside your brand.',
    exampleBefore: 'Title: "Services" (8 chars)',
    exampleAfter: 'Title: "Custom Software & Cloud DevOps Services | BestPeers" (52 chars)',
    tip: 'Formula: [Primary Service / Benefit] - [Secondary Context] | [Brand Name]'
  },
  'Page Titles: Multiple': {
    rootCause: 'There are two or more <title> tags inside the page HTML. This usually happens when an SEO plugin and a theme template both output a title tag.',
    impact: 'Search engines are forced to guess which title to show, often picking the wrong or generic default one.',
    fixGuide: 'Audit your theme header template and SEO plugin settings to ensure only one <title> element is rendered.',
    exampleBefore: '<title>Default WordPress Site</title> AND <title>Enterprise DevOps Consulting</title>',
    exampleAfter: '<title>Enterprise DevOps Consulting & Cloud Architecture | Brand</title>',
    tip: 'Disable theme-level title output if you are using an SEO plugin like Yoast, RankMath, or Next.js metadata.'
  },
  'Page Titles: Outside <head>': {
    rootCause: 'The <title> tag was placed inside the <body> tag or after </head> instead of inside the <head> container.',
    impact: 'Violates HTML5 standards. Search engines and browsers may ignore the title or parse it unpredictably.',
    fixGuide: 'Move the <title> tag into the <head> section of your HTML template.',
    exampleBefore: '<body> <title>My Portfolio</title> <h1>Welcome</h1> </body>',
    exampleAfter: '<head> <title>My Portfolio | BestPeers</title> </head> <body> <h1>Welcome</h1> </body>',
    tip: 'Always ensure your <head> opens before any visible body content or scripts.'
  },
  'Page Titles: Same as H1': {
    rootCause: 'Your <title> tag and your main on-page <h1> headline are word-for-word the exact same text.',
    impact: 'You are missing a prime opportunity to attract more searchers. Your title attracts search clicks from Google, while your H1 guides users once they are on the page.',
    fixGuide: 'Differentiate them: make your Title search-focused with your brand and target keywords, and keep your H1 conversational and welcoming for on-page visitors.',
    exampleBefore: 'Title: "Portfolio"  |  H1: "Portfolio"',
    exampleAfter: 'Title: "Custom Software Portfolio & Client Case Studies | BestPeers"\nH1: "Our Work & Selected Client Projects"',
    tip: 'Your Title is your advertisement on Google; your H1 is your welcome sign on the page.'
  },
  'Meta Description: Missing': {
    rootCause: 'This page has no meta description tag declared in its HTML <head>.',
    impact: 'Google will auto-generate a snippet by scraping random page text (often navigation links, cookie banners, or headers), resulting in an unappealing search preview.',
    fixGuide: 'Write a persuasive 1–2 sentence summary (120–155 characters) that highlights the page benefit and includes a clear reason to click.',
    exampleBefore: 'HTML: <head> (No meta description tag found) </head>',
    exampleAfter: 'HTML: <meta name="description" content="Explore custom full-stack software development, cloud migration, and AI solutions trusted by 100+ global brands. Get in touch today."> (151 chars)',
    tip: 'Think of your meta description as free ad copy that convinces searchers to click your link over competitors.'
  },
  'Meta Description: Duplicate': {
    rootCause: 'Multiple pages share the exact same meta description text across your website.',
    impact: 'Search engines will often ignore duplicate descriptions and auto-generate snippets instead, diluting brand consistency.',
    fixGuide: 'Write distinct meta descriptions tailored to the unique topic or product on each page.',
    exampleBefore: '10 different service pages all using: "We provide great services at affordable prices. Contact us today."',
    exampleAfter: 'Page A: "Enterprise DevOps consulting to accelerate deployment cycles by 4x. Learn more."\nPage B: "Full-stack mobile app development for iOS & Android with dedicated engineers."',
    tip: 'For large catalogs, template descriptions using product attributes: "Buy {{ product.name }} in {{ product.color }}. Free shipping."'
  },
  'Meta Description: Over 155 Characters': {
    rootCause: 'Your meta description exceeds 155 characters (~960 pixels) and will be cut off by Google on mobile and desktop screens.',
    impact: 'Searchers will see truncated text ending in "...", hiding your value proposition and call to action.',
    fixGuide: 'Trim your meta description to between 120 and 155 characters. Keep your core hook in the first 120 characters.',
    exampleBefore: 'Description: "We provide high end custom full stack software engineering and AI machine learning consulting services for early stage startups and enterprise corporations across the United States with 24/7 dedicated support." (227 chars)',
    exampleAfter: 'Description: "Expert custom software and AI engineering for startups and enterprise brands. Get dedicated developers and fast delivery today." (130 chars)',
    tip: 'Mobile screens cut off descriptions around 120 characters. Keep your key punchline early.'
  },
  'Meta Description: Below 70 Characters': {
    rootCause: 'Your meta description is too short (under 70 characters) and leaves valuable search snippet space empty.',
    impact: 'Underutilizes available SERP real estate and gives searchers too little reason to choose your site.',
    fixGuide: 'Expand your description to 120–155 characters by adding a compelling benefit, customer proof, or call to action.',
    exampleBefore: 'Description: "We build websites and mobile apps." (35 chars)',
    exampleAfter: 'Description: "Award-winning custom web and mobile app development. Fast turnaround, dedicated engineers, and transparent pricing. Request a quote." (137 chars)',
    tip: 'Aim for 2 short, punchy sentences with an action verb at the end.'
  },
  'Meta Description: Multiple': {
    rootCause: 'More than one <meta name="description"> tag was found in the HTML.',
    impact: 'Search engines encounter conflicting descriptions and may ignore both, falling back to scraped body text.',
    fixGuide: 'Remove duplicate meta description tags from your theme or plugins so only one is rendered.',
    exampleBefore: '<meta name="description" content="Old text..."> AND <meta name="description" content="New text...">',
    exampleAfter: 'Keep only one optimized <meta name="description" content="..."> tag in <head>.',
    tip: 'Check if multiple SEO plugins or theme settings are competing to output meta tags.'
  },
  'Meta Description: Outside <head>': {
    rootCause: 'The meta description tag is located inside the <body> tag or outside the <head> block.',
    impact: 'Search engine bots may not parse the description, resulting in missing snippet metadata.',
    fixGuide: 'Ensure the <meta name="description"> tag is strictly positioned inside <head>...</head>.',
    exampleBefore: '<body> <meta name="description" content="..."> <div>Content</div> </body>',
    exampleAfter: '<head> <meta name="description" content="..."> </head> <body> ... </body>',
    tip: 'Always place charset, title, and meta tags within the first 1,024 bytes of the HTML head.'
  },
  'H1: Missing': {
    rootCause: 'This page has no <h1> headline in its visible body text.',
    impact: 'Search engines and screen readers rely on the <h1> to understand the primary topic of the page. Without it, topical hierarchy is lost.',
    fixGuide: 'Add a single, prominent <h1> headline near the top of the main content area summarizing the core topic.',
    exampleBefore: 'Page jumps directly to <h2> or <div> text without an <h1> headline.',
    exampleAfter: '<h1>Custom Cloud Architecture & DevOps Solutions</h1>',
    tip: 'Every indexable page should have exactly one prominent <h1> heading.'
  },
  'H1: Multiple': {
    rootCause: 'This page has two or more <h1> tags in its code (commonly when logos, banners, or widgets use <h1>).',
    impact: 'Dilutes your page\'s topical focus and creates confusion for accessibility screen readers.',
    fixGuide: 'Reserve <h1> strictly for the main page headline. Change logos, headers, or widget titles to <div>, <span>, or <h2>.',
    exampleBefore: '<h1><img src="logo.png" alt="Company Logo" /></h1> AND <h1>Our Services</h1>',
    exampleAfter: '<div class="logo"><img src="logo.png" alt="Company Logo" /></div> AND <h1>Our Services</h1>',
    tip: 'Think of your page like a newspaper: one main headline (H1), followed by section subheadings (H2).'
  },
  'H1: Duplicate': {
    rootCause: 'Multiple pages on your website share the identical <h1> headline.',
    impact: 'Signals potential duplicate or thin content to search engines, making it hard for Google to tell your pages apart.',
    fixGuide: 'Make each page\'s <h1> unique and tailored to the specific content on that URL.',
    exampleBefore: 'Page A H1: "Our Services"\nPage B H1: "Our Services"',
    exampleAfter: 'Page A H1: "Mobile App Development Services"\nPage B H1: "Cloud Migration & Infrastructure Services"',
    tip: 'Be specific: instead of "Services", write "Full-Stack Development Services for FinTech".'
  },
  'H1: Over 70 Characters': {
    rootCause: 'The <h1> heading is unusually long (over 70 characters), reading more like a paragraph than a headline.',
    impact: 'Looks cluttered on mobile screens and weakens topical punch for both readers and search engines.',
    fixGuide: 'Shorten the <h1> into a crisp, impactful headline (under 70 characters), and move secondary details into a subhead (<h2> or <p>).',
    exampleBefore: '<h1>We Are The Leading Provider Of Scalable Cloud Infrastructure And Mobile App Development Services For Global Enterprise Brands Across The World</h1> (153 chars)',
    exampleAfter: '<h1>Scalable Cloud Infrastructure & Mobile App Development</h1> (59 chars)',
    tip: 'Keep the <h1> punchy. Use a sub-headline paragraph below it for extra context.'
  },
  'H1: Non-Sequential': {
    rootCause: 'The heading hierarchy jumps out of order (e.g. <h3> or <h4> appears before <h1>, or skips <h2>).',
    impact: 'Violates accessibility standards (WCAG) and makes it difficult for assistive screen readers and AI agents to parse your content outline.',
    fixGuide: 'Nest headings logically: <h1> (page title) -> <h2> (major sections) -> <h3> (sub-points).',
    exampleBefore: '<h1>Main Title</h1> <h4>Small Detail</h4> <h2>Section</h2>',
    exampleAfter: '<h1>Main Title</h1> <h2>Section</h2> <h3>Sub-topic</h3>',
    tip: 'Never choose a heading tag just for its font size; use CSS classes for styling and HTML tags for structure.'
  },
  'H2: Missing': {
    rootCause: 'The page has an <h1> headline, but contains no secondary <h2> subheadings in the body text.',
    impact: 'Long blocks of text without subheadings are hard to skim for readers and miss opportunities to rank for secondary search queries.',
    fixGuide: 'Break up your content into readable sections using descriptive <h2> subheadings.',
    exampleBefore: 'A 1,000-word article with an <h1> and unbroken paragraphs of text.',
    exampleAfter: 'Add 3–4 <h2> subheadings (e.g. <h2>Key Benefits</h2>, <h2>How It Works</h2>, <h2>Pricing</h2>).',
    tip: 'Subheadings keep readers engaged longer, lowering your bounce rate.'
  },
  'H2: Duplicate': {
    rootCause: 'The same <h2> subheading text is repeated multiple times on the same page.',
    impact: 'Indicates redundant content sections and creates confusion for readers skimming the page.',
    fixGuide: 'Make every <h2> unique and descriptive of the specific section below it.',
    exampleBefore: 'Two different sections both titled: <h2>Features</h2>',
    exampleAfter: '<h2>Security & Compliance Features</h2> AND <h2>Integration & API Features</h2>',
    tip: 'Add a distinguishing modifier to duplicate subheadings to clarify what each section covers.'
  },
  'Content: Exact Duplicates': {
    rootCause: 'Two or more URLs share 100% identical body content (e.g. HTTP vs HTTPS versions, trailing slash duplicates, or un-canonicalized clones).',
    impact: 'Wastes crawl budget and splits your Google ranking authority between duplicate URLs.',
    fixGuide: 'Set a canonical tag pointing to the preferred URL, or add a 301 permanent redirect from the duplicate to the original.',
    exampleBefore: 'https://site.com/services and https://site.com/services/ both serving 200 OK with identical copy.',
    exampleAfter: '301 redirect https://site.com/services to https://site.com/services/ with a canonical tag.',
    tip: 'Ensure your server enforces uniform trailing slash and HTTPS rules sitewide.'
  },
  'Content: Near Duplicates': {
    rootCause: 'Multiple pages share over 90% overlapping text with only tiny template or location changes.',
    impact: 'Triggers Google\'s helpful content filters, which may deprioritize or suppress the near-duplicate pages from search results.',
    fixGuide: 'Add unique case studies, local testimonials, and distinct details to each page, or consolidate them into a single comprehensive guide.',
    exampleBefore: '5 city pages ("Plumber in Dallas", "Plumber in Austin") with 99% identical boilerplate text.',
    exampleAfter: 'Add genuine local photos, localized pricing, local client reviews, and specific service areas.',
    tip: 'If you can\'t write at least 50% unique content for a page, consider combining it into a broader page.'
  },
  'Content: Low Content Pages': {
    rootCause: 'This page has fewer than 200 words of body copy, classified as thin content by search engines.',
    impact: 'Google often refuses to index thin pages because they provide insufficient value to searchers.',
    fixGuide: 'Expand the page with helpful answers, key features, FAQs, and clear explanations, or apply a noindex tag if it is a utility page.',
    exampleBefore: 'Page with only 45 words: "Welcome to our store. We sell widgets. Call us."',
    exampleAfter: 'Expand to 300+ words with widget specifications, comparisons, customer reviews, and FAQs.',
    tip: 'Informational pages should generally have at least 300–500 words of genuinely useful content.'
  },
  'Content: Soft 404 Pages': {
    rootCause: 'The page displays a "Not Found", "Item Unavailable", or empty state, but returns an HTTP 200 OK status instead of a proper 404 code.',
    impact: 'Google wastes crawl budget indexing blank or useless pages, hurting overall site quality scores.',
    fixGuide: 'Configure your web server to return a real HTTP 404 or 410 status code when content is not found.',
    exampleBefore: 'URL "/discontinued-item" renders a "Sorry, not found" message with HTTP 200 OK.',
    exampleAfter: 'Server returns HTTP 404 Not Found (or 301 redirects to the active category).',
    tip: 'Google Search Console explicitly flags Soft 404s as indexing errors.'
  },
  'Content: Lorem Ipsum Placeholder': {
    rootCause: 'Unpublished placeholder text ("Lorem ipsum dolor sit amet...") was left in your live production HTML.',
    impact: 'Destroys brand credibility and signals unmaintained staging content to search engines.',
    fixGuide: 'Replace all placeholder text with finalized, approved copy.',
    exampleBefore: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit...</p>',
    exampleAfter: '<p>Our engineering team delivers production-ready applications tailored to your business needs.</p>',
    tip: 'Search your codebase for "lorem" before deploying updates to production.'
  },
  'Validation: Multiple <body> Tags': {
    rootCause: 'The HTML contains more than one <body> tag, usually caused by misconfigured CMS layout wrappers or duplicate templates.',
    impact: 'Breaks browser DOM parsing, which can cause JavaScript scripts to fail and layouts to glitch.',
    fixGuide: 'Review your layout wrappers and theme templates to ensure there is only one <body> opening and closing tag.',
    exampleBefore: '<html> <body>...</body> <body>...</body> </html>',
    exampleAfter: '<html> <head>...</head> <body>...all content here...</body> </html>',
    tip: 'Valid HTML structure: exactly one <html>, one <head>, and one <body> per document.'
  },
  'Validation: Missing <head> Tag': {
    rootCause: 'The document lacks a valid <head> opening tag, placing metadata directly in the root or body.',
    impact: 'Browsers and search crawlers must guess where metadata begins and ends, often failing to read critical SEO tags.',
    fixGuide: 'Wrap all title, meta, link, and script tags inside a valid <head>...</head> block.',
    exampleBefore: '<html> <title>Title</title> <body>...</body> </html>',
    exampleAfter: '<html> <head><title>Title</title></head> <body>...</body> </html>',
    tip: 'Always declare <!DOCTYPE html> followed by <html><head>...</head><body>...</body></html>.'
  },
  'Validation: Multiple <head> Tags': {
    rootCause: 'Multiple <head> tags appear in the HTML document.',
    impact: 'Search crawlers may ignore metadata in the secondary head tags, causing missed canonicals or indexing tags.',
    fixGuide: 'Consolidate all meta, title, link, and script elements into a single <head> element.',
    exampleBefore: '<head>...</head> <head>...</head>',
    exampleAfter: 'A single, clean <head>...</head> block containing all document metadata.',
    tip: 'Check your CMS plugins to make sure none of them are injecting an extra <head> tag.'
  },
  'Validation: Missing <body> Tag': {
    rootCause: 'The document does not have a <body> tag wrapping visible content.',
    impact: 'Violates W3C standards and can cause rendering inconsistencies across different mobile and desktop browsers.',
    fixGuide: 'Wrap all visible page markup inside a single <body>...</body> container.',
    exampleBefore: '<head>...</head> <div>Content without body tag</div>',
    exampleAfter: '<head>...</head> <body> <div>Content here</div> </body>',
    tip: 'Browsers will attempt to auto-repair missing body tags, but this can break hydration in React/Next.js.'
  },
  'Validation: HTML Document Over 2MB': {
    rootCause: 'The raw uncompressed HTML payload exceeds 2 megabytes, usually due to inlined Base64 images, massive SVGs, or bloated JSON state payloads.',
    impact: 'Severely slows down initial page load (TTFB), increases hosting bandwidth, and can cause mobile crawlers to abandon rendering.',
    fixGuide: 'Move inline Base64 images to external CDN files, externalize inline CSS/JS, and trim oversized preloaded state objects.',
    exampleBefore: 'HTML size: 3.4 MB (Contains 2.8 MB of inline base64 image strings)',
    exampleAfter: 'HTML size: 85 KB (Images loaded externally from CDN: <img src="https://cdn.../photo.webp">)',
    tip: 'Aim for HTML document sizes under 100 KB for optimal Core Web Vitals.'
  },
  'Canonicals: Missing': {
    rootCause: 'This page does not have a <link rel="canonical" href="..."> tag declared.',
    impact: 'Leaves your page vulnerable to duplicate content issues from URL query parameters (e.g. ?utm_source=, ?sort=), session IDs, or protocol variations.',
    fixGuide: 'Add a self-referential canonical tag pointing to the clean, definitive URL of this page.',
    exampleBefore: 'HTML: <head> (No canonical tag declared) </head>',
    exampleAfter: 'HTML: <link rel="canonical" href="https://yourdomain.com/services/" />',
    tip: 'Every single indexable page should have a canonical tag pointing to its own definitive URL.'
  },
  'Canonicals: Multiple': {
    rootCause: 'More than one <link rel="canonical"> tag was found on the page.',
    impact: 'When multiple canonical tags conflict, Google ignores all of them, leaving your page unprotected against duplicate content.',
    fixGuide: 'Ensure exactly one canonical link element is rendered per page.',
    exampleBefore: '<link rel="canonical" href="/page-a"> AND <link rel="canonical" href="/page-b">',
    exampleAfter: 'Keep only one: <link rel="canonical" href="https://yourdomain.com/page-a" />',
    tip: 'Check that your theme template and your SEO plugin aren\'t both printing canonical tags.'
  },
  'Canonicals: Canonical Is Relative': {
    rootCause: 'The canonical tag uses a relative URL (e.g. href="/about") instead of a full absolute URL (e.g. href="https://site.com/about").',
    impact: 'Can cause crawler misinterpretation when pages are accessed across subdomains, protocols, or staging environments.',
    fixGuide: 'Always specify the complete absolute URL including protocol (https://) and domain name.',
    exampleBefore: '<link rel="canonical" href="/portfolio/" />',
    exampleAfter: '<link rel="canonical" href="https://bestpeers.com/portfolio/" />',
    tip: 'Google\'s official guidelines explicitly request full absolute URLs for canonical tags.'
  },
  'Response_Codes: Redirection (Meta Refresh)': {
    rootCause: 'The page sends visitors elsewhere with a <meta http-equiv="refresh"> tag or a Refresh HTTP header instead of a server redirect.',
    impact: 'Search engines treat refresh redirects as weaker, slower signals than 301s, and users briefly see the old page.',
    fixGuide: 'Replace the refresh with a server-side 301 redirect to the destination URL.',
    exampleBefore: '<meta http-equiv="refresh" content="0; url=/new-page/">',
    exampleAfter: 'Server config: 301 redirect /old-page/ -> /new-page/',
    tip: 'Most CMS redirect plugins (Yoast Premium, Redirection, Rank Math) create proper 301s.'
  },
  'Canonicals: Unlinked': {
    rootCause: 'The canonical URL this page points to is not linked from anywhere else on the site.',
    impact: 'Google weighs internal links when choosing a canonical; a target nobody links to is a weak signal and may be ignored.',
    fixGuide: 'Link internally to the canonical URL (menus, related links) instead of the duplicate, or correct the canonical tag.',
    exampleBefore: 'Menu links to /shoes?sort=new, canonical points to /shoes/',
    exampleAfter: 'Menu links to /shoes/',
    tip: 'Internal links, sitemaps and canonicals should all agree on the same URL.'
  },
  'Images: Missing Alt Text': {
    rootCause: 'One or more <img> tags have empty alt text (alt="") or no alt attribute. Empty alt is correct for purely decorative images, so review these rather than fixing all of them.',
    impact: 'Informative images without alt text cannot be understood by screen-reader users or indexed in Google Images.',
    fixGuide: 'Add descriptive alt text to images that carry information (products, diagrams, people). Leave alt="" on decorative patterns, dividers and icons.',
    exampleBefore: '<img src="/shoes/mens-running-shoe.jpg" alt="" />',
    exampleAfter: '<img src="/shoes/mens-running-shoe.jpg" alt="Men\'s red breathable running shoe with cushioned sole" />',
    tip: 'Describe what someone with their eyes closed would need to know about the image.'
  },
  'Images: Missing Alt Attribute': {
    rootCause: '<img> tags completely lack the `alt` attribute altogether.',
    impact: 'Fails WCAG accessibility standards and triggers SEO validation warnings.',
    fixGuide: 'Add `alt="..."` attributes to all images across your HTML and CMS media library.',
    exampleBefore: '<img src="/banner.jpg" />',
    exampleAfter: '<img src="/banner.jpg" alt="Team collaborating on software development in office" />',
    tip: 'For purely decorative graphics or background patterns, use an empty attribute `alt=""` or CSS background.'
  },
  'Security: HTTP URLs': {
    rootCause: 'Insecure http:// URLs were detected being served or linked on an https:// website.',
    impact: 'Triggers mixed-content security warnings in Chrome and Safari, and misses out on Google\'s HTTPS ranking boost.',
    fixGuide: 'Update all internal asset links (images, scripts, styles) and page links to use https://, and enforce HTTPS redirects.',
    exampleBefore: '<img src="http://yourdomain.com/logo.png" />',
    exampleAfter: '<img src="https://yourdomain.com/logo.png" />',
    tip: 'Use relative protocol links or update your database to replace all "http://" with "https://".'
  },
  'JavaScript: Pages with JavaScript Errors': {
    rootCause: 'Uncaught JavaScript errors or console exceptions were thrown while the browser loaded this page.',
    impact: 'Can break dynamic navigation, forms, client-side rendering, and tracking pixels for users and bots.',
    fixGuide: 'Open browser DevTools Console (F12) to trace the exact line number of the JavaScript error and fix the underlying bug.',
    exampleBefore: 'Console: Uncaught TypeError: Cannot read properties of undefined (reading "map")',
    exampleAfter: 'Console: Clean execution with 0 errors.',
    tip: 'Add optional chaining (`data?.items?.map`) to prevent null reference errors from crashing your page.'
  },
  'Search Console: Excluded from Google Index': {
    rootCause: 'Google Search Console reports that Google has explicitly excluded this page from search results.',
    impact: 'The page receives zero organic search traffic because searchers cannot find it on Google.',
    fixGuide: 'Open Google Search Console URL Inspection, check the specific exclusion reason (e.g. noindex, redirect, crawl anomaly), and fix accordingly.',
    exampleBefore: 'GSC Status: "Excluded by \'noindex\' tag"',
    exampleAfter: 'Remove accidental noindex tag; submit URL to GSC for indexing.',
    tip: 'Check that staging robots.txt or noindex tags weren\'t accidentally deployed to production.'
  },
  'Search Console: Crawled - Currently Not Indexed': {
    rootCause: 'Googlebot has crawled this page, but chose not to index it, typically due to low perceived content quality or duplicate content.',
    impact: 'The page is unreachable via search queries despite being discovered by Google.',
    fixGuide: 'Improve page depth with original insights, FAQs, clear media, and internal links from your highest-authority pages.',
    exampleBefore: 'Thin 100-word page without internal links.',
    exampleAfter: 'Rich 600-word guide with custom visuals, customer FAQs, and 3 internal links from homepage.',
    tip: 'Google rarely indexes pages that look like near-copies of other pages on the internet.'
  },
  'Search Console: Canonical Mismatch (Google Chose Different Canonical)': {
    rootCause: 'Google ignored the canonical tag you specified and selected a different URL as the authoritative version.',
    impact: 'Google ranks the wrong page in search results, splitting link equity and traffic away from your preferred URL.',
    fixGuide: 'Align all signals: update internal links, sitemaps, and redirects to point consistently to your chosen canonical URL.',
    exampleBefore: 'You declared: "https://site.com/product" | Google chose: "https://site.com/category/product"',
    exampleAfter: 'Update internal links and sitemap so all internal signals point to "https://site.com/product".',
    tip: 'Google chooses its own canonical if internal links disagree with your declared canonical tag.'
  },
  'Search Console: High Impressions with Low CTR (< 1.5%)': {
    rootCause: 'The page appears often in Google search results (high impressions), but users rarely click on it (CTR below 1.5%).',
    impact: 'You have done the hard work of ranking on Google, but are losing thousands of potential visitors to competitors with better headlines.',
    fixGuide: 'Rewrite your title tag and meta description to be more compelling, click-worthy, and benefit-driven.',
    exampleBefore: 'Title: "Services | Company Name" (CTR: 0.8% with 15,000 impressions)',
    exampleAfter: 'Title: "Top-Rated Software Engineering Services | 24hr Turnaround" (CTR: 4.2%)',
    tip: 'Adding numbers, year (e.g. 2026), or strong action words often doubles CTR on search results.'
  },
  'Search Console: Striking Distance Opportunity (Position 11–20)': {
    rootCause: 'The page ranks on page 2 of Google (average position 11 to 20) for valuable keywords.',
    impact: 'Less than 2% of searchers ever click onto page 2. These keywords have massive traffic potential that is currently untapped.',
    fixGuide: 'Add 2–3 internal links from your highest-authority pages with keyword-rich anchor text, and add a brief FAQ section targeting the keyword.',
    exampleBefore: 'Rank #14 for "custom devops consulting" with zero internal links from homepage.',
    exampleAfter: 'Add anchor link on homepage: "Explore our [custom devops consulting] solutions" -> pushes rank into Top 5.',
    tip: 'Moving a keyword from position #12 to #4 can increase organic traffic by over 800%.'
  },
  'PageSpeed: Core Web Vitals Failing (LCP > 2.5s or CLS > 0.1)': {
    rootCause: 'Your Largest Contentful Paint (LCP) takes over 2.5s to load, or elements jump around while loading (CLS > 0.1).',
    impact: 'Google penalizes slow sites in search rankings, and mobile visitors bounce if the page takes more than 3 seconds to load.',
    fixGuide: 'Compress images to modern WebP format, eliminate render-blocking CSS/JS, and set explicit width and height on image and video tags.',
    exampleBefore: 'Mobile LCP: 4.8s (due to uncompressed 3MB hero image) | CLS: 0.28 (layout shifts when banner loads)',
    exampleAfter: 'Mobile LCP: 1.4s (WebP compressed image + preloaded hero) | CLS: 0.01',
    tip: 'Always compress hero images under 150 KB and preload them in <head>.'
  },
  'Google Analytics: Critical Revenue Risk (Broken High-Traffic Page)': {
    rootCause: 'A URL that historically drove high revenue or traffic is currently returning a 404 or 500 error.',
    impact: 'Direct revenue loss: customers clicking from bookmarks, emails, or Google hit an error and leave without purchasing.',
    fixGuide: 'Immediately restore the page template or set up a 301 permanent redirect to the nearest active product or category.',
    exampleBefore: 'Top revenue page "/checkout-upgrade" returns 404 Not Found ($12,000/mo estimated loss).',
    exampleAfter: 'Immediately restore page or 301 redirect to "/upgrade".',
    tip: 'Treat broken high-traffic URLs as P0 emergency bugs.'
  },
  'Google Analytics: Zombie Page Detected (0 Visits in 90 Days)': {
    rootCause: 'This page has received zero visits in the last 90 days and has thin content or buried crawl depth.',
    impact: 'Wastes crawl budget and dilutes your domain\'s topical authority across search engines.',
    fixGuide: 'Consolidate the content into a parent topic guide, redirect it to an active category, or delete and 410/301 redirect it.',
    exampleBefore: 'Outdated blog post from 2018 with 0 visits in 3 months.',
    exampleAfter: 'Redirect to updated 2026 comprehensive guide or merge into a resource hub.',
    tip: 'Pruning dead, zero-traffic pages often boosts the rankings of your remaining active pages.'
  },
  // --- SECURITY SUITE (SCREAMING FROG STANDARD) ---
  'Security: Mixed Content': {
    rootCause: 'An HTTPS web page is loading active resources (images, scripts, stylesheets, or iframes) over insecure HTTP connections.',
    impact: 'Modern browsers block mixed active content or display a glaring "Not Secure" warning in the address bar, destroying customer trust and conversion rates.',
    fixGuide: 'Change all hardcoded "http://" asset URLs inside your templates, CSS, and database to "https://" or site-root relative paths.',
    exampleBefore: 'Page: "https://yourdomain.com/checkout"\nAsset: "<script src=\'http://cdn.example.com/widget.js\'>"',
    exampleAfter: 'Page: "https://yourdomain.com/checkout"\nAsset: "<script src=\'https://cdn.example.com/widget.js\'>"',
    tip: 'Search and replace "http://yourdomain.com" in your CMS database with "https://yourdomain.com".'
  },
  'Security: Missing HSTS Header': {
    rootCause: 'Your web server does not send the Strict-Transport-Security (HSTS) response header.',
    impact: 'Leaves visitors vulnerable to SSL-stripping man-in-the-middle attacks when they first connect over insecure Wi-Fi.',
    fixGuide: 'Add the HSTS response header in your web server or CDN (Nginx, Cloudflare, Apache, Vercel) with at least 1 year max-age.',
    exampleBefore: 'Response Headers: (No Strict-Transport-Security header present)',
    exampleAfter: 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    tip: 'HSTS guarantees browsers will refuse to load any unencrypted HTTP versions of your site.'
  },
  'Security: Missing Content-Security-Policy Header': {
    rootCause: 'The page lacks a Content-Security-Policy (CSP) response header or meta tag.',
    impact: 'Vulnerable to cross-site scripting (XSS) and rogue script injections from malicious browser extensions or compromised third-party plugins.',
    fixGuide: 'Configure a Content-Security-Policy header specifying trusted script, style, and image origins.',
    exampleBefore: 'Headers: (No Content-Security-Policy header returned)',
    exampleAfter: 'Content-Security-Policy: default-src \'self\'; script-src \'self\' https://trustedscripts.com;',
    tip: 'Start in "Content-Security-Policy-Report-Only" mode to test before strictly enforcing.'
  },
  'Security: Missing X-Content-Type-Options Header': {
    rootCause: 'The server response is missing "X-Content-Type-Options: nosniff".',
    impact: 'Browsers may attempt to guess (sniff) the MIME type of a file, potentially executing malicious user-uploaded text or image files as executable JavaScript.',
    fixGuide: 'Configure your web server or edge CDN to send "X-Content-Type-Options: nosniff" on all responses.',
    exampleBefore: 'HTTP Response: (Header missing)',
    exampleAfter: 'X-Content-Type-Options: nosniff',
    tip: 'This is a zero-risk 1-line configuration in Nginx or Cloudflare Transform Rules.'
  },
  'Security: Missing X-Frame-Options Header': {
    rootCause: 'The page does not declare X-Frame-Options (or CSP frame-ancestors).',
    impact: 'Malicious third-party sites can embed your pages inside an invisible <iframe> and execute clickjacking attacks against logged-in users.',
    fixGuide: 'Add "X-Frame-Options: SAMEORIGIN" or "DENY" to your global server headers.',
    exampleBefore: 'Header: (Missing)',
    exampleAfter: 'X-Frame-Options: SAMEORIGIN',
    tip: 'If you embed your own site in apps, use SAMEORIGIN; otherwise, use DENY.'
  },
  'Security: Missing Secure Referrer-Policy Header': {
    rootCause: 'The page either lacks a Referrer-Policy or uses an insecure policy like "unsafe-url" or "no-referrer-when-downgrade".',
    impact: 'May leak sensitive customer URL query parameters (session tokens, user IDs, internal search queries) to external websites when users click outbound links.',
    fixGuide: 'Set "Referrer-Policy: strict-origin-when-cross-origin" in your HTTP response headers or <meta name="referrer">.',
    exampleBefore: 'Referrer-Policy: unsafe-url',
    exampleAfter: 'Referrer-Policy: strict-origin-when-cross-origin',
    tip: '"strict-origin-when-cross-origin" protects path privacy while preserving referral traffic attribution in analytics.'
  },
  'Security: Unsafe Cross-Origin Links': {
    rootCause: 'Outbound external links with target="_blank" do not have rel="noopener" or rel="noreferrer".',
    impact: 'The destination page can access your window object via `window.opener` and redirect your visitor to a phishing page in the background (tabnabbing).',
    fixGuide: 'Add rel="noopener noreferrer" to all external links opening in new browser tabs.',
    exampleBefore: '<a href="https://external-partner.com" target="_blank">Partner Site</a>',
    exampleAfter: '<a href="https://external-partner.com" target="_blank" rel="noopener noreferrer">Partner Site</a>',
    tip: 'Modern frameworks often handle this, but legacy CMS content frequently contains manual target="_blank" tags.'
  },
  'Security: Protocol-Relative Resource Links': {
    rootCause: 'Resources are linked using protocol-relative syntax ("//domain.com/asset.js").',
    impact: 'Deprecated practice that can trigger unexpected HTTP requests or mixed content warnings on modern secure browsers.',
    fixGuide: 'Update all protocol-relative references to explicit "https://" URLs.',
    exampleBefore: '<script src="//cdn.example.com/bundle.js"></script>',
    exampleAfter: '<script src="https://cdn.example.com/bundle.js"></script>',
    tip: 'Explicit HTTPS is always faster because modern HTTP/2 and HTTP/3 protocols require TLS.'
  },
  // --- INTERNAL LINK SCORE & GRAPH RULES ---
  'Links: Pages With High Crawl Depth': {
    rootCause: 'The page requires 4 or more clicks from the homepage to reach.',
    impact: 'Search engine bots crawl deeply buried pages much less frequently, and search engines assign them negligible link equity and lower rankings.',
    fixGuide: 'Add internal links from higher-level category hubs, parent pillar pages, or featured footer menus to bring crawl depth under 3.',
    exampleBefore: 'Homepage -> Resources -> Articles -> 2024 -> Guides -> Page (Crawl Depth: 5)',
    exampleAfter: 'Homepage -> Main Category Hub -> Page (Crawl Depth: 2)',
    tip: 'Aim for 100% of your critical money and service pages to have a crawl depth of 1, 2, or 3.'
  },
  'Links: Pages With High Internal Outlinks': {
    rootCause: 'The page has more than 150 internal followed links pointing to other pages.',
    impact: 'Excessive internal links dilute the PageRank equity passed to each individual link and can trigger spam warnings.',
    fixGuide: 'Streamline the page\'s navigation, prune redundant mega-menus, and consolidate internal link lists.',
    exampleBefore: 'Page contains 320 footer and sidebar navigation links.',
    exampleAfter: 'Consolidate mega-menu to essential category hubs (reducing outlinks to 65).',
    tip: 'Keep total links per page under 100–150 to maximize PageRank flow to priority pages.'
  },
  'Links: Non-Indexable Page Inlinks Only': {
    rootCause: 'This indexable page is only linked to by non-indexable URLs (such as 404 error pages, 301 redirects, or noindex pages).',
    impact: 'Googlebot cannot easily discover or flow link equity to this page because legitimate indexable pages do not link to it.',
    fixGuide: 'Add followed internal links from live, indexable parent pages, blog posts, or main navigation menus.',
    exampleBefore: 'Page is only linked from an old 301 redirect URL and a 404 page.',
    exampleAfter: 'Add internal link directly from the active services directory page.',
    tip: 'Always ensure important pages are anchored from high-authority indexable pages.'
  },
  // --- XML SITEMAPS RECONCILIATION RULES ---
  'Sitemaps: Non-Indexable URLs in Sitemap': {
    rootCause: 'Your sitemap.xml contains URLs that return 4xx/5xx errors, redirect (3xx), are marked noindex, or are canonicalised elsewhere.',
    impact: 'Wastes search engine crawl budget, sends contradictory indexing signals, and reduces Google\'s trust in your sitemap accuracy.',
    fixGuide: 'Regenerate your XML sitemap to strictly include only 200 OK, canonical, indexable URLs.',
    exampleBefore: 'Sitemap contains: "https://yourdomain.com/deleted-product" (Returns 404 Not Found)',
    exampleAfter: 'Remove deleted URL from sitemap.xml so only live 200 OK URLs remain.',
    tip: 'A clean sitemap should only ever contain 100% canonical, indexable destination pages.'
  },
  'Sitemaps: Orphan URLs': {
    rootCause: 'A URL exists in your XML sitemap but has zero internal links pointing to it anywhere on your crawled website.',
    impact: 'Orphan pages receive no internal link equity and are treated by search engines as neglected, low-priority content.',
    fixGuide: 'Add at least 1–2 internal links from relevant category hubs or blog posts pointing to this orphan URL.',
    exampleBefore: 'Sitemap lists "/special-offer", but no link anywhere on the site points to it.',
    exampleAfter: 'Add link from main navigation or homepage banner to "/special-offer".',
    tip: 'If an orphan page is outdated or temporary, remove it from the sitemap and 301 redirect it.'
  },
  'Sitemaps: URLs Not In Sitemap': {
    rootCause: 'This page is live, 200 OK, and indexable, but is missing from your XML sitemap.',
    impact: 'Search engines may take longer to discover new updates or changes to this page.',
    fixGuide: 'Update your XML sitemap generation plugin or script to include all live, indexable content pages.',
    exampleBefore: 'New product page crawled successfully, but absent from sitemap.xml.',
    exampleAfter: 'Include page in sitemap.xml with updated `<lastmod>` timestamp.',
    tip: 'Automate sitemap generation upon page publishing in your CMS.'
  }
};

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };

/**
 * Every check from the backend scoring engine (GET /crawls/{id}/summary), merged with the display
 * metadata above. Scores and pass/fail/not-evaluated states are computed only on the server.
 * @param {object[]} pages  crawled pages (used to resolve failing page ids to rows)
 * @param {object|null} summary  backend summary payload
 */
export function generateAllEvaluatedChecks(pages, summary) {
  if (!summary?.rules) return [];
  const byId = new Map((pages || []).map(p => [p.id, p]));
  return summary.rules.map(rule => {
    const meta = RULE_METADATA[rule.id] || {};
    const label = rule.category.replace(/_/g, ' ');
    const affected = (rule.failing_page_ids || []).map(id => byId.get(id)).filter(Boolean);
    const notEvaluated = rule.status === 'not_evaluated';
    return {
      name: rule.id,
      ruleName: rule.rule,
      category: rule.category,
      type: rule.type,
      priority: rule.priority,
      severity: rule.severity,
      scope: rule.scope,
      integration: Boolean(rule.integration),
      // False when the check has no written guide and the texts below are generic placeholders.
      hasGuide: Boolean(meta.rootCause),
      rootCause: meta.rootCause || `Condition '${rule.rule}' was detected for ${label}.`,
      impact: meta.impact || 'Affects technical health, crawlability, and indexing performance in search engines.',
      fixGuide: meta.fixGuide || `Review the affected URLs and update page templates to resolve '${rule.rule}'.`,
      exampleBefore: meta.exampleBefore,
      exampleAfter: meta.exampleAfter,
      tip: meta.tip,
      affected_pages: affected,
      count: rule.failing_count,
      evaluatedCount: rule.evaluated_count,
      percentage: rule.evaluated_count > 0 ? ((rule.failing_count / rule.evaluated_count) * 100).toFixed(1) : '0.0',
      isPassing: rule.status === 'pass',
      notEvaluated,
      notEvaluatedReason: rule.reason,
      status: notEvaluated ? 'Not evaluated' : (rule.status === 'pass' ? 'Passed' : 'Flagged'),
    };
  });
}

/** Failing checks only, highest priority and widest impact first. */
export function generateIssuesReport(pages, summary) {
  return generateAllEvaluatedChecks(pages, summary)
    .filter(r => r.status === 'Flagged')
    .sort((a, b) => (PRIORITY_RANK[b.priority] || 1) - (PRIORITY_RANK[a.priority] || 1) || b.count - a.count);
}


/**
 * Compact context builder that keeps LLM input tokens minimal (< 250 tokens).
 * Samples only top 2 offending pages and truncates long text fields.
 */
export function buildIssueAiContext(issue, domain = '') {
  const affected = issue.affected_pages || [];
  let cleanDomain = domain;
  if (!cleanDomain && affected.length > 0 && affected[0].url) {
    try {
      cleanDomain = new URL(affected[0].url).hostname;
    } catch {
      cleanDomain = '';
    }
  }

  const samplePages = affected.slice(0, 3).map(p => ({
    url: p.url,
    title_1: (p.title_1 || p.title || '').slice(0, 120),
    h1_1: (p.h1_1 || p.h1 || '').slice(0, 120),
    meta_desc_1: (p.meta_desc_1 || p.meta_desc || '').slice(0, 160),
    status_code: p.status_code ?? 0,
    canonical_link_element_1: p.canonical_link_element_1 || p.canonical_url || '',
    indexability: p.indexability || p.indexability_status || 'Indexable',
    word_count: p.word_count || 0
  }));

  const projId = issue.project_id || affected[0]?.project_id || (typeof window !== 'undefined' ? parseInt(localStorage.getItem('active_project_id') || '1', 10) : 1);

  return {
    project_id: projId || 1,
    issue_name: issue.ruleName || issue.name,
    category: issue.category || 'SEO',
    domain: cleanDomain || 'Target Website',
    total_affected: affected.length,
    sample_pages: samplePages
  };
}

/**
 * Merges AI-generated diagnosis back into an issue object seamlessly.
 */
export function applyAiDiagnosis(issue, aiResult) {
  if (!issue || !aiResult || !aiResult.data) return issue;
  const d = aiResult.data;
  return {
    ...issue,
    rootCause: d.rootCause || issue.rootCause,
    impact: d.impact || issue.impact,
    fixGuide: d.fixGuide || issue.fixGuide,
    exampleBefore: d.exampleBefore || issue.exampleBefore,
    exampleAfter: d.exampleAfter || issue.exampleAfter,
    tip: d.tip || issue.tip,
    isAiEnriched: Boolean(aiResult.is_live_ai),
    aiPoweredBy: aiResult.powered_by || 'AI Engine'
  };
}
