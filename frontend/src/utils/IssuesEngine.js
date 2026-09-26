// Comprehensive diagnostic rule engine replicating Screaming Frog, AEO and GEO standards.
// Evaluates pages and produces actionable issues with root causes, search impacts, and fixes.

export const RULE_METADATA = {
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
  'Images: Missing Alt Text': {
    rootCause: 'One or more <img> tags have an empty alt attribute (alt="") or are missing alt text.',
    impact: 'Visually impaired users using screen readers cannot understand the image, and Google cannot index it in Google Images search.',
    fixGuide: 'Add a clear, descriptive alt text attribute describing what is shown in each informative image.',
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
    name: 'Response Codes: Redirection (3xx)',
    ruleName: 'Redirection (3xx)',
    category: 'Response_Codes',
    type: 'Warning',
    priority: 'Medium',
    evaluate: (page) => (page.status_code >= 300 && page.status_code < 400) || page.audit_data?.Response_Codes?.['3xx'] === true
  },
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
  },
  // --- GOOGLE SEARCH CONSOLE DIAGNOSTIC RULES ---
  {
    name: 'Search Console: Excluded from Google Index',
    ruleName: 'Excluded from Google Index',
    category: 'Search_Console',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => {
      const gsc = page.audit_data?.Search_Console;
      if (!gsc) return false;
      const status = (gsc.Google_Index_Status || '').toLowerCase();
      const state = (gsc.Index_Coverage_State || '').toLowerCase();
      return status.includes('excluded') || state.includes('excluded') || status.includes('not indexed');
    }
  },
  {
    name: 'Search Console: Crawled - Currently Not Indexed',
    ruleName: 'Crawled - Currently Not Indexed',
    category: 'Search_Console',
    type: 'Warning',
    priority: 'Medium',
    evaluate: (page) => {
      const gsc = page.audit_data?.Search_Console;
      return (gsc?.Index_Coverage_State || '').toLowerCase().includes('not indexed');
    }
  },
  {
    name: 'Search Console: Canonical Mismatch (Google Chose Different Canonical)',
    ruleName: 'Canonical Mismatch (Google Chose Different Canonical)',
    category: 'Search_Console',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => {
      const gsc = page.audit_data?.Search_Console;
      return gsc?.Canonical_Mismatch === true;
    }
  },
  {
    name: 'Search Console: High Impressions with Low CTR (< 1.5%)',
    ruleName: 'High Impressions with Low CTR (< 1.5%)',
    category: 'Search_Console',
    type: 'Opportunity',
    priority: 'Low',
    evaluate: (page) => {
      const gsc = page.audit_data?.Search_Console;
      if (!gsc) return false;
      const imp = gsc.Impressions_Num !== undefined 
        ? gsc.Impressions_Num 
        : parseInt(String(gsc.Search_Impressions || '0').replace(/,/g, ''), 10) || 0;
      const ctr = gsc.CTR_Num !== undefined 
        ? gsc.CTR_Num 
        : parseFloat(String(gsc.Average_CTR || '0').replace('%', '')) || 0;
      return imp >= 80 && ctr > 0 && ctr < 1.5;
    }
  },
  {
    name: 'Search Console: Striking Distance Opportunity (Position 11–20)',
    ruleName: 'Striking Distance Opportunity (Position 11–20)',
    category: 'Search_Console',
    type: 'Opportunity',
    priority: 'Low',
    evaluate: (page) => {
      const gsc = page.audit_data?.Search_Console;
      if (!gsc) return false;
      const pos = gsc.Position_Num !== undefined 
        ? gsc.Position_Num 
        : parseFloat(String(gsc.Average_SERP_Position || '0')) || 0;
      return pos >= 10.5 && pos <= 20.4;
    }
  },
  // --- PAGESPEED / CORE WEB VITALS RULES ---
  {
    name: 'PageSpeed: Core Web Vitals Failing (LCP > 2.5s or CLS > 0.1)',
    ruleName: 'Core Web Vitals Failing (LCP > 2.5s or CLS > 0.1)',
    category: 'PageSpeed',
    type: 'Warning',
    priority: 'Medium',
    evaluate: (page) => {
      const metrics = page.audit_data?.PageSpeed?.mobile?.metrics;
      if (!metrics) return false;
      const lcp = parseFloat(String(metrics.lcp || '0').replace('s', '').trim());
      const cls = parseFloat(String(metrics.cls || '0').trim());
      return lcp > 2.5 || cls > 0.1;
    }
  },
  // --- GOOGLE ANALYTICS (GA4) RULES ---
  {
    name: 'Google Analytics: Critical Revenue Risk (Broken High-Traffic Page)',
    ruleName: 'Critical Revenue Risk (Broken High-Traffic Page)',
    category: 'Google_Analytics',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => {
      const ga = page.audit_data?.Google_Analytics;
      const isErr = (page.status_code || 200) >= 400;
      return isErr && Boolean(ga?.Revenue_At_Risk && (ga.Revenue_At_Risk.includes('Critical') || ga.Revenue_At_Risk.includes('P0')));
    }
  },
  {
    name: 'Google Analytics: Zombie Page Detected (0 Visits in 90 Days)',
    ruleName: 'Zombie Page Detected (0 Visits in 90 Days)',
    category: 'Google_Analytics',
    type: 'Opportunity',
    priority: 'Low',
    evaluate: (page) => {
      const ga = page.audit_data?.Google_Analytics;
      return ga?.Is_Zombie_Page === true;
    }
  }
];

// Dynamically inject rules based on the configs
Object.entries(CATEGORY_CONFIGS).forEach(([category, rulesMap]) => {
  Object.entries(rulesMap).forEach(([ruleName, type]) => {
     let priority = 'Medium';
     if (type === 'Issue') priority = 'High';
     else if (type === 'Warning') priority = 'Medium';
     else if (type === 'Opportunity') priority = 'Low';
     
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
             // Screaming Frog standard: On-page SEO rules only apply to 200 OK pages
             if (page.status_code && page.status_code !== 200) return false;
             const val = page.audit_data?.[category]?.[ruleName];
             return val === true;
         }
     });
  });
});

export function generateAllEvaluatedChecks(pages) {
  if (!pages || pages.length === 0) return [];
  const totalPages = pages.length;

  const report = RULES.map(rule => {
    const meta = RULE_METADATA[rule.name] || {};
    return {
      ...rule,
      rootCause: rule.rootCause || meta.rootCause || 'Diagnostic rule condition detected by the crawler.',
      impact: rule.impact || meta.impact || 'Impairs search engine ranking, indexation, or user experience.',
      fixGuide: rule.fixGuide || meta.fixGuide || 'Review affected URLs and resolve template/server configurations.',
      exampleBefore: rule.exampleBefore || meta.exampleBefore,
      exampleAfter: rule.exampleAfter || meta.exampleAfter,
      tip: rule.tip || meta.tip,
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

  return report.map(r => ({
    ...r,
    isPassing: r.count === 0,
    status: r.count === 0 ? 'Passed' : 'Flagged',
    percentage: totalPages > 0 ? ((r.count / totalPages) * 100).toFixed(1) : '0.0'
  }));
}

export function generateIssuesReport(pages) {
  const allChecks = generateAllEvaluatedChecks(pages);
  const activeIssues = allChecks
    .filter(r => r.count > 0)
    .sort((a, b) => {
      const priorityRank = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aRank = priorityRank[a.priority] || 1;
      const bRank = priorityRank[b.priority] || 1;
      if (aRank !== bRank) {
        return bRank - aRank;
      }
      return b.count - a.count;
    });

  return activeIssues;
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

  const samplePages = affected.slice(0, 2).map(p => ({
    url: p.url,
    title_1: (p.title_1 || '').slice(0, 85),
    h1_1: (p.h1_1 || '').slice(0, 85),
    meta_desc_1: (p.meta_desc_1 || '').slice(0, 120),
    status_code: p.status_code || 200,
    word_count: p.word_count || 0
  }));

  return {
    project_id: 1,
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
