/**
 * Comprehensive Technical SEO, Screaming Frog, AEO & GEO Diagnostic Knowledge Base.
 * Provides deep contextual intelligence for every audit check:
 * - What it is (Definition)
 * - Why it is True / False on this page (Root Cause)
 * - Why it is an Issue (Search & Business Impact)
 * - How to Resolve (Actionable Remediation Guide)
 */

export const DIAGNOSTIC_DEFINITIONS = {
  // =========================================================================
  // 1. URI & URL STRUCTURE
  // =========================================================================
  'Non ASCII Characters': {
    category: 'URI',
    label: 'Non-ASCII Characters',
    severity: 'Warning',
    what: 'Checks whether the URL path or query contains characters outside standard 128 ASCII characters (e.g. accented letters, Cyrillic, non-Latin symbols).',
    whyIssue: 'Non-ASCII characters require URL percentage encoding (%C3%A9). When shared across social platforms, external sites, or API clients, encoded strings often break, causing 404 errors or link attribution drops.',
    whyPassed: 'All characters in the URL string adhere strictly to standard alphanumeric ASCII conventions.',
    impact: 'Can cause broken backlinks, social sharing failures, and unexpected URL normalization issues across search engines.',
    howToResolve: 'Transliterate or sanitize URL slugs to use lowercase ASCII characters and hyphens only (e.g. rewrite "/café" to "/cafe"). Set up a 301 redirect from the legacy URL.'
  },
  'Underscores': {
    category: 'URI',
    label: 'Underscores in URL',
    severity: 'Opportunity',
    what: 'Detects underscore "_" characters in the URL slug or path segments.',
    whyIssue: 'Google\'s official search guidelines explicitly recommend hyphens "-" instead of underscores "_". Googlebot treats hyphens as word separators (e.g., "red-car" = "red" and "car"), whereas underscores may be treated as a single merged word ("red_car" = "red_car").',
    whyPassed: 'The URL uses standard hyphens or clean slugs with no underscore separators.',
    impact: 'Sub-optimizes keyword extraction by search engines and slight degradation of topical relevance signals.',
    howToResolve: 'Update URL permalink structures in your CMS or router to use hyphens instead of underscores (e.g. change "/service_new/" to "/service-new/"). Implement a permanent 301 redirect from the old URL.'
  },
  'Uppercase': {
    category: 'URI',
    label: 'Uppercase Characters in URL',
    severity: 'Warning',
    what: 'Detects capital letters in the URL path.',
    whyIssue: 'Web servers running Linux/Unix are case-sensitive. If "/About" and "/about" both exist, search engines treat them as two distinct pages, causing duplicate content, diluted PageRank, or 404 errors if users link in lowercase.',
    whyPassed: 'All characters in the URL path are consistently lowercase.',
    impact: 'Duplicate content penalties, internal link confusion, and potential 404 errors.',
    howToResolve: 'Enforce lowercase URL rewriting rules in Nginx, Apache, or Next.js middleware, and ensure CMS slugs are saved in lowercase. 301 redirect any mixed-case URLs.'
  },
  'Multiple Slashes': {
    category: 'URI',
    label: 'Multiple Consecutive Slashes (//)',
    severity: 'Warning',
    what: 'Detects consecutive slashes ("//") in the URL path (e.g., "example.com/blog//post").',
    whyIssue: 'Double slashes in paths can confuse routing engines, generate endless crawler trap loops, and create duplicate versions of the same content.',
    whyPassed: 'The URL path contains clean, normalized single-slash directory boundaries.',
    impact: 'Wastes crawl budget and triggers redirect chains or canonical mismatches.',
    howToResolve: 'Update server routing rules or CMS link generators to strip redundant slashes before outputting URLs. Redirect duplicate slash URLs to single-slash versions via 301.'
  },
  'Repetitive Path': {
    category: 'URI',
    label: 'Repetitive Directory Path',
    severity: 'Warning',
    what: 'Checks whether the URL path repeats the same folder segment more than once (e.g., "/category/tools/category/tools").',
    whyIssue: 'Repetitive segments usually signal recursive URL rewriting bugs, infinite crawler loops, or misconfigured facet navigation.',
    whyPassed: 'Each path segment is unique with no recursive folder loops.',
    impact: 'Causes search crawlers to get stuck in infinite depth loops, rapidly exhausting site crawl budget.',
    howToResolve: 'Fix relative link resolution in templates and correct server rewrite patterns. Add a disallow rule in robots.txt for recursive patterns if necessary.'
  },
  'Contains Space': {
    category: 'URI',
    label: 'Contains Space or %20',
    severity: 'Issue',
    what: 'Detects literal whitespace characters or encoded "%20" strings in the URL path.',
    whyIssue: 'Spaces in URLs are invalid per RFC 3986. They break markdown parsers, email links, and CMS link extractors.',
    whyPassed: 'The URL path contains zero spaces or encoded whitespace sequences.',
    impact: 'Users clicking shared links receive broken 404 errors; crawlers may truncate the URL at the space boundary.',
    howToResolve: 'Replace all spaces in file/page names with hyphens. Set 301 redirects from the space-containing URLs.'
  },
  'Internal Search': {
    category: 'URI',
    label: 'Internal Search URL',
    severity: 'Opportunity',
    what: 'Checks if this URL represents an internal search query endpoint (containing "q=", "s=", or "search=").',
    whyIssue: 'Google Webmaster Guidelines state that internal search results pages should generally not be indexed because they create endless thin or empty pages.',
    whyPassed: 'This is a genuine canonical content or landing page, not an internal search result.',
    impact: 'Indexation of search pages causes index bloat, thin content warnings, and crawl budget depletion.',
    howToResolve: 'Add a "noindex, follow" robots meta tag to internal search templates, or disallow them in robots.txt (e.g. "Disallow: /?s=*").'
  },
  'Parameters': {
    category: 'URI',
    label: 'URL Query Parameters',
    severity: 'Opportunity',
    what: 'Checks whether the URL contains query parameters (e.g., "?filter=color&sort=price").',
    whyIssue: 'URLs with parameters can produce dozens of variations of the same content, triggering duplicate content filters unless properly canonicalized.',
    whyPassed: 'Clean, clean-slug static URL with no query parameters.',
    impact: 'Dilutes inbound link equity across parameter variations and creates crawl inefficiencies.',
    howToResolve: 'Ensure pages with parameters declare a self-referencing canonical URL pointing to the master clean URL, or use URL parameter handling in Google Search Console.'
  },
  'Broken Bookmark': {
    category: 'URI',
    label: 'Broken Bookmark / Fragment Identifier',
    severity: 'Warning',
    what: 'Detects URLs containing hash fragments ("#") that link to non-existent HTML anchor IDs or empty fragments.',
    whyIssue: 'Search engine bots do not index content after hash fragments, and users clicking the link land at the top of the page rather than the intended section.',
    whyPassed: 'URL has no broken or misplaced bookmark hash fragments.',
    impact: 'Poor user experience and degraded on-page navigation signals.',
    howToResolve: 'Ensure internal anchor links correspond to valid `id="..."` attributes on the destination page, or strip fragments from internal links.'
  },
  'GA Tracking Parameters': {
    category: 'URI',
    label: 'GA / UTM Tracking Parameters in Internal Links',
    severity: 'Warning',
    what: 'Detects Google Analytics UTM parameters ("utm_source", "utm_medium", etc.) appended to internal website links.',
    whyIssue: 'Using UTM tags on internal links overwrites the original referrer session in Google Analytics (destroying organic search attribution data) and creates duplicate URLs in search indexes.',
    whyPassed: 'Internal links use clean paths without UTM tracking query parameters.',
    impact: 'Corrupts web analytics data and splits link equity across multiple parameterized URLs.',
    howToResolve: 'Remove UTM parameters from all internal navigation links. Use GA4 custom event tracking or data-attributes instead of query strings for internal tracking.'
  },
  'Over 115 Characters': {
    category: 'URI',
    label: 'URL Over 115 Characters',
    severity: 'Opportunity',
    what: 'Checks whether the total URL string length exceeds 115 characters.',
    whyIssue: 'Very long URLs are harder for users to read, copy, and remember, and research shows shorter, keyword-focused URLs achieve higher click-through rates in SERPs.',
    whyPassed: 'URL length is compact and under 115 characters.',
    impact: 'Reduced click-through rate in organic search results and truncated display in mobile browser address bars.',
    howToResolve: 'Condense URL slug by removing filler words (e.g. "and", "the", "for") and keeping only 3–5 core keyword terms.'
  },

  // =========================================================================
  // 2. PAGE TITLES
  // =========================================================================
  'Page_Titles: Missing': {
    category: 'Page_Titles',
    label: 'Missing Title Tag',
    severity: 'Issue',
    what: 'Checks whether the HTML document contains a non-empty <title> tag inside the <head> element.',
    whyIssue: 'The <title> tag is the single most important on-page SEO factor. Without it, search engines must invent an arbitrary headline from body text, severely damaging CTR and ranking potential.',
    whyPassed: 'Page contains an active, valid <title> tag in the document <head>.',
    impact: 'Catastrophic loss of organic search visibility, click-through rates, and social media preview snippet quality.',
    howToResolve: 'Add a descriptive <title> tag inside the <head> element: `<title>Primary Keyword - Brand Name</title>`. Target 30–60 characters.'
  },
  'Page_Titles: Duplicate': {
    category: 'Page_Titles',
    label: 'Duplicate Title Tag',
    severity: 'Issue',
    what: 'Checks whether two or more distinct URLs share the exact same title tag string.',
    whyIssue: 'Duplicate titles cause keyword cannibalization: Google cannot determine which page is the most authoritative, resulting in lower rankings for all competing pages.',
    whyPassed: 'This page has a completely unique title tag across the entire website.',
    impact: 'Cannibalizes keyword authority and confuses search engine indexers.',
    howToResolve: 'Craft a unique title tag for every indexable URL. Include the specific product name, service name, or topic to differentiate each page.'
  },
  'Page_Titles: Over 60 Characters': {
    category: 'Page_Titles',
    label: 'Title Over 60 Characters',
    severity: 'Warning',
    what: 'Checks whether the title tag character count exceeds 60 characters.',
    whyIssue: 'Google desktop and mobile SERPs allocate approximately 580–600 pixels of visual width for headlines. Titles exceeding ~60 characters get truncated with an ellipsis ("..."), cutting off important branding or conversion messaging.',
    whyPassed: 'Title length is 60 characters or fewer, fitting neatly within Google SERP display limits.',
    impact: 'SERP truncation cuts off calls-to-action and lowers user click-through rates.',
    howToResolve: 'Condense the title to between 45 and 60 characters. Place your highest-value target keyword at the very beginning of the title.'
  },
  'Page_Titles: Below 30 Characters': {
    category: 'Page_Titles',
    label: 'Title Below 30 Characters',
    severity: 'Opportunity',
    what: 'Checks whether the title tag character count is fewer than 30 characters.',
    whyIssue: 'Titles under 30 characters (such as "Home" or "Services") fail to utilize valuable ranking real estate and provide inadequate topical context to search engines and users.',
    whyPassed: 'Title length is substantive (30+ characters), fully utilizing search snippet space.',
    impact: 'Missed opportunity to rank for secondary keywords and weaker user click intent.',
    howToResolve: 'Expand the title to 45–60 characters by adding a secondary keyword modifier and brand suffix (e.g. "Web Design Services in New York | Agency").'
  },
  'Page_Titles: Over 561 Pixels': {
    category: 'Page_Titles',
    label: 'Title Over 561 Pixels',
    severity: 'Warning',
    what: 'Calculates the proportional typographic pixel width of the title tag string using standard Arial 20px SERP font metrics.',
    whyIssue: 'Google truncates titles based on pixel width, not character count. Wide letters ("W", "M", capitals) can cause a 55-character title to truncate if pixel width exceeds 561px.',
    whyPassed: 'The rendered pixel width of the title is 561px or less, ensuring full visibility in Google search results.',
    impact: 'Visual truncation in Google SERPs with trailing ellipses.',
    howToResolve: 'Shorten wide words, remove unnecessary capitalizations or pipe separators, and verify that pixel width is below 561px.'
  },
  'Page_Titles: Below 200 Pixels': {
    category: 'Page_Titles',
    label: 'Title Below 200 Pixels',
    severity: 'Opportunity',
    what: 'Checks whether the rendered pixel width of the title is under 200 pixels.',
    whyIssue: 'The title tag headline is visually narrow, utilizing less than 35% of the available headline space in search results.',
    whyPassed: 'Rendered pixel width adequately fills the search snippet container.',
    impact: 'Under-leveraged SERP headline presence.',
    howToResolve: 'Add supporting keyword descriptors or localized geographic terms to expand the headline.'
  },
  'Page_Titles: Same as H1': {
    category: 'Page_Titles',
    label: 'Title is Identical to H1',
    severity: 'Opportunity',
    what: 'Checks whether the <title> tag text is identical to the primary <h1> heading text.',
    whyIssue: 'While not a critical error, having identical Title and H1 tags misses the opportunity to target keyword synonyms. The title should be crafted for SERP CTR (including brand name), while the H1 should be crafted for on-page reading and engagement.',
    whyPassed: 'The title and H1 heading are differentiated, targeting complementary keyword variations.',
    impact: 'Missed topical depth and semantic keyword coverage.',
    howToResolve: 'Differentiate your <title> (e.g. "Expert SEO Audit Services | Agency") from your <h1> (e.g. "Comprehensive Website & AI Search Audits").'
  },
  'Page_Titles: Multiple': {
    category: 'Page_Titles',
    label: 'Multiple Title Tags',
    severity: 'Issue',
    what: 'Detects more than one <title> element inside the HTML DOM.',
    whyIssue: 'Having multiple title tags creates ambiguity. Browsers and search engines may choose the wrong title or merge them unpredictably.',
    whyPassed: 'Exactly one <title> tag exists in the document.',
    impact: 'Unpredictable SERP headline rendering and potential HTML parser errors.',
    howToResolve: 'Inspect layout templates and SEO plugins to remove duplicate <title> tag outputs so only one tag renders.'
  },
  'Page_Titles: Outside <head>': {
    category: 'Page_Titles',
    label: 'Title Tag Outside <head>',
    severity: 'Issue',
    what: 'Detects a <title> tag located in the <body> tag or outside the valid <head> element.',
    whyIssue: 'W3C HTML standards require <title> tags to be children of <head>. Search engine crawlers may fail to parse or completely ignore titles placed in the body.',
    whyPassed: 'The <title> tag is correctly placed inside the <head> container.',
    impact: 'Googlebot may fail to read the title tag, resulting in missing titles in search indexation.',
    howToResolve: 'Move the <title> element strictly inside the `<head>...</head>` container.'
  },

  // =========================================================================
  // 3. META DESCRIPTION
  // =========================================================================
  'Meta_Description: Missing': {
    category: 'Meta_Description',
    label: 'Missing Meta Description',
    severity: 'Issue',
    what: 'Checks whether a <meta name="description"> tag is present and populated in the document <head>.',
    whyIssue: 'When a meta description is absent, Google generates snippet text by scraping random sentences from the page, often showing fragmented or uncompelling copy that lowers CTR.',
    whyPassed: 'A dedicated meta description tag is present and populated.',
    impact: 'Reduced click-through rates (typically 10–25% lower CTR) and poor social share card previews.',
    howToResolve: 'Add a compelling meta description summarizing the page value proposition: `<meta name="description" content="...">`. Aim for 120–155 characters.'
  },
  'Meta_Description: Duplicate': {
    category: 'Meta_Description',
    label: 'Duplicate Meta Description',
    severity: 'Issue',
    what: 'Checks whether multiple URLs share the exact same meta description string.',
    whyIssue: 'Duplicate descriptions make search result snippets look repetitive and unhelpful across multiple pages of your domain.',
    whyPassed: 'This page has a completely unique meta description.',
    impact: 'Search engines are more likely to override duplicate descriptions with auto-generated body snippets.',
    howToResolve: 'Write page-specific meta descriptions tailored to the unique topic or product on each page.'
  },
  'Meta_Description: Over 155 Characters': {
    category: 'Meta_Description',
    label: 'Meta Description Over 155 Characters',
    severity: 'Warning',
    what: 'Checks whether the meta description exceeds 155 characters.',
    whyIssue: 'Google truncates descriptions beyond ~155–160 characters (or ~985 pixels), meaning call-to-action statements or key value propositions placed at the end will not be seen by searchers.',
    whyPassed: 'Meta description length is 155 characters or fewer, fitting comfortably within SERP snippet limits.',
    impact: 'Snippet truncation with trailing ellipses in Google search results.',
    howToResolve: 'Condense description to between 120 and 155 characters, keeping the primary call to action within the first 120 characters.'
  },
  'Meta_Description: Below 70 Characters': {
    category: 'Meta_Description',
    label: 'Meta Description Below 70 Characters',
    severity: 'Opportunity',
    what: 'Checks whether the meta description is shorter than 70 characters.',
    whyIssue: 'Very short meta descriptions fail to provide enough context to convince a searcher to click and are frequently replaced by Google with scraped body text.',
    whyPassed: 'Meta description provides a substantial, detailed summary (70+ characters).',
    impact: 'Sub-optimal snippet click-through rate.',
    howToResolve: 'Expand description to 120–150 characters by highlighting key features, customer benefits, and a clear call-to-action.'
  },
  'Meta_Description: Multiple': {
    category: 'Meta_Description',
    label: 'Multiple Meta Descriptions',
    severity: 'Issue',
    what: 'Detects two or more <meta name="description"> tags in the DOM.',
    whyIssue: 'Multiple meta description tags confuse search engine crawlers, which may pick the wrong description or disregard both.',
    whyPassed: 'Exactly one meta description tag is present in the document.',
    impact: 'Unpredictable snippet display in search engine results.',
    howToResolve: 'Ensure header templates and SEO plugins render only a single meta description element.'
  },
  'Meta_Description: Outside <head>': {
    category: 'Meta_Description',
    label: 'Meta Description Outside <head>',
    severity: 'Issue',
    what: 'Detects a meta description tag located outside the valid <head> element.',
    whyIssue: 'HTML standards dictate all `<meta>` metadata must be placed in `<head>`. Tags placed in `<body>` may be ignored by crawlers.',
    whyPassed: 'Meta description is correctly located inside the document <head>.',
    impact: 'Crawlers may fail to parse the description, treating the page as having no meta description.',
    howToResolve: 'Move the meta description tag inside the `<head>` section of your page template.'
  },

  // =========================================================================
  // 4. HEADINGS (H1 & H2)
  // =========================================================================
  'H1: Missing': {
    category: 'H1',
    label: 'Missing H1 Heading',
    severity: 'Issue',
    what: 'Checks whether the page contains an <h1> heading tag in the document body.',
    whyIssue: 'The <h1> tag represents the primary topic indicator of an HTML document. Without an <h1>, search engines and AI answer engines struggle to understand the core subject of the page.',
    whyPassed: 'Page contains a clear, primary <h1> heading tag.',
    impact: 'Weakens semantic keyword relevance and hurts accessibility screen reader navigation.',
    howToResolve: 'Add a single prominent <h1> heading at the top of the main content area summarizing the page topic.'
  },
  'H1: Multiple': {
    category: 'H1',
    label: 'Multiple H1 Headings',
    severity: 'Warning',
    what: 'Detects two or more <h1> tags in the HTML body.',
    whyIssue: 'While HTML5 technically allows multiple H1s, SEO best practice and WCAG accessibility standards call for exactly one primary <h1> per page. Multiple H1s dilute topic focus and confuse screen readers.',
    whyPassed: 'Page has exactly one primary <h1> heading tag.',
    impact: 'Dilutes topical focus and causes heading hierarchy issues in accessibility evaluations.',
    howToResolve: 'Keep <h1> for the main page title only. Demote secondary headlines, section headers, or logo text to <h2> or <h3> tags.'
  },
  'H1: Over 70 Characters': {
    category: 'H1',
    label: 'H1 Over 70 Characters',
    severity: 'Opportunity',
    what: 'Checks whether the <h1> heading string exceeds 70 characters.',
    whyIssue: 'An overly long <h1> behaves more like a paragraph than a concise heading, diluting its semantic punch and clarity.',
    whyPassed: 'H1 heading is concise and under 70 characters.',
    impact: 'Weakens heading readability and semantic keyword focus.',
    howToResolve: 'Condense the <h1> into a punchy, high-impact headline and move supporting details into an introductory paragraph.'
  },
  'H1: Non-Sequential': {
    category: 'H1',
    label: 'Non-Sequential Heading Structure',
    severity: 'Warning',
    what: 'Checks if heading levels skip hierarchy (e.g. <h2> appears without an <h1>, or <h3> appears directly under <h1>).',
    whyIssue: 'Headings must follow a logical descending tree (H1 -> H2 -> H3). Skipping levels breaks the document outline for screen readers and AI semantic parsers.',
    whyPassed: 'Heading hierarchy is orderly and sequential.',
    impact: 'Accessibility failures (WCAG 2.1) and degraded semantic outline clarity.',
    howToResolve: 'Ensure heading tags follow strict numerical hierarchy: nest <h2> inside the <h1> section, and <h3> inside <h2> sections.'
  },
  'H2: Missing': {
    category: 'H2',
    label: 'Missing H2 Headings',
    severity: 'Opportunity',
    what: 'Checks whether the page contains any <h2> subheadings in the content body.',
    whyIssue: 'Long-form content without <h2> subheadings is difficult for users to skim and denies search engines the opportunity to rank for secondary topic clusters.',
    whyPassed: 'Page is well-structured with descriptive <h2> subheadings.',
    impact: 'Higher bounce rates due to poor skim-readability and missed long-tail keyword rankings.',
    howToResolve: 'Divide the page content into clear, logical sections with descriptive <h2> subheadings containing secondary keywords.'
  },

  // =========================================================================
  // 5. CANONICALS & DIRECTIVES
  // =========================================================================
  'Canonicals: Missing': {
    category: 'Canonicals',
    label: 'Missing Canonical Tag',
    severity: 'Warning',
    what: 'Checks whether the page specifies a <link rel="canonical" href="..."> element.',
    whyIssue: 'Without a declared canonical URL, search engines must guess which version of a page is the primary one, leaving the site vulnerable to tracking parameters and duplicate URL variations.',
    whyPassed: 'Page explicitly declares an authoritative canonical URL tag.',
    impact: 'Susceptible to duplicate content dilution from parameters, trailing slashes, or protocol variations.',
    howToResolve: 'Add a self-referencing canonical tag in the `<head>` of the page: `<link rel="canonical" href="https://example.com/current-page" />`.'
  },
  'Canonicals: Multiple': {
    category: 'Canonicals',
    label: 'Multiple Canonical Tags',
    severity: 'Issue',
    what: 'Detects two or more <link rel="canonical"> tags on the same page.',
    whyIssue: 'When multiple canonical tags exist, search engines ignore ALL of them, completely defeating the purpose of canonicalization.',
    whyPassed: 'Exactly one canonical link element is present.',
    impact: 'Google ignores the canonical directive entirely, selecting its own arbitrary canonical.',
    howToResolve: 'Inspect page templates and CMS SEO plugins to eliminate duplicate canonical outputs so only a single canonical tag renders.'
  },
  'Canonicals: Canonical Is Relative': {
    category: 'Canonicals',
    label: 'Canonical URL is Relative',
    severity: 'Warning',
    what: 'Checks whether the canonical href attribute uses a relative path (e.g. href="/about") instead of a full absolute URL.',
    whyIssue: 'Google recommends absolute URLs (including "https://" and domain). Relative paths can cause crawler confusion across subdomains, protocols, or mirror environments.',
    whyPassed: 'Canonical URL is an absolute URL with full scheme and domain.',
    impact: 'Potential canonical misinterpretation across protocols or environment mirrors.',
    howToResolve: 'Always use full absolute URLs in canonical tags: `href="https://example.com/about"` instead of `href="/about"`.'
  },
  'Canonicals: Outside <head>': {
    category: 'Canonicals',
    label: 'Canonical Tag Outside <head>',
    severity: 'Issue',
    what: 'Detects a <link rel="canonical"> tag located outside the valid <head> element.',
    whyIssue: 'Search engines only acknowledge canonical directives declared inside the document `<head>`. Body canonicals are ignored.',
    whyPassed: 'Canonical link element is properly located within the document <head>.',
    impact: 'Google completely disregards the canonical directive.',
    howToResolve: 'Move the canonical link element inside the `<head>...</head>` container.'
  },
  'Directives: Outside <head>': {
    category: 'Directives',
    label: 'Meta Robots Directive Outside <head>',
    severity: 'Issue',
    what: 'Detects a <meta name="robots"> tag placed in the <body> or outside the <head> element.',
    whyIssue: 'W3C and Googlebot standards require meta robots directives to reside in `<head>`. Directives outside the head may be ignored.',
    whyPassed: 'Meta robots directive is positioned properly inside the document <head>.',
    impact: 'Indexation directives (noindex/nofollow) may not be honored, causing unintended indexing.',
    howToResolve: 'Relocate the `<meta name="robots">` element into the `<head>` section.'
  },

  // =========================================================================
  // 6. CONTENT & QUALITY
  // =========================================================================
  'Content: Low Content Pages': {
    category: 'Content',
    label: 'Thin Content (< 200 Words)',
    severity: 'Warning',
    what: 'Checks whether the visible body text word count is under 200 words.',
    whyIssue: 'Thin content pages struggle to demonstrate topical authority and are frequently filtered out of search engine indexes under Google\'s Helpful Content System.',
    whyPassed: 'Page contains substantive content depth (> 200 words).',
    impact: 'Low organic rankings, high bounce rates, and inability of AI engines to extract useful answers.',
    howToResolve: 'Enrich the page with comprehensive information, FAQs, case studies, or actionable advice. If it is a utility page, consider applying a "noindex" tag.'
  },
  'Content: Soft 404 Pages': {
    category: 'Content',
    label: 'Soft 404 Page',
    severity: 'Issue',
    what: 'Detects pages that return an HTTP 200 OK success status code but display a "Page Not Found", "Missing Item", or empty content screen to users.',
    whyIssue: 'Search engines waste crawl budget indexing empty or deleted pages, polluting the search index and degrading domain quality scores.',
    whyPassed: 'Page returns genuine, valid content corresponding to its HTTP 200 status.',
    impact: 'Wasted crawl budget and lower overall site quality rating in Google.',
    howToResolve: 'Configure the web server to return a genuine HTTP 404 (Not Found) or 410 (Gone) status code for deleted or non-existent pages.'
  },
  'Content: Lorem Ipsum Placeholder': {
    category: 'Content',
    label: 'Lorem Ipsum Placeholder Detected',
    severity: 'Issue',
    what: 'Scans visible body text for dummy template filler text ("lorem ipsum").',
    whyIssue: 'Placeholder copy left on live production pages indicates unfinished development, destroys brand trust, and signals low site quality to search algorithms.',
    whyPassed: 'Zero dummy or placeholder text detected in body copy.',
    impact: 'Damages brand reputation and triggers quality demotions.',
    howToResolve: 'Audit the page markup and replace all dummy placeholder strings with finalized, reviewed production copy.'
  },

  // =========================================================================
  // 7. IMAGES & ACCESSIBILITY
  // =========================================================================
  'Images: Missing Alt Text': {
    category: 'Images',
    label: 'Images with Missing Alt Text',
    severity: 'Warning',
    what: 'Detects <img> tags with an empty or blank alt attribute (`alt=""`).',
    whyIssue: 'Search engine bots cannot see images without descriptive alt text, and visually impaired users relying on screen readers receive zero context.',
    whyPassed: 'All informational images have descriptive alt text populated.',
    impact: 'Loss of Google Images search traffic and non-compliance with WCAG accessibility guidelines.',
    howToResolve: 'Add concise, descriptive alt text to all informational images (e.g. `alt="Dashboard performance metrics graph"`).'
  },
  'Images: Missing Alt Attribute': {
    category: 'Images',
    label: 'Images Missing Alt Attribute Entirely',
    severity: 'Warning',
    what: 'Detects <img> tags where the `alt` attribute is completely absent.',
    whyIssue: 'Missing the alt attribute entirely violates HTML5 accessibility validation and causes screen readers to read out raw image file paths.',
    whyPassed: 'Every image tag includes a valid alt attribute.',
    impact: 'Violates WCAG 2.1 Level A compliance standards.',
    howToResolve: 'Ensure all `<img>` tags in templates include an `alt="..."` attribute (use `alt=""` only for purely decorative divider images).'
  },

  // =========================================================================
  // 8. DOM VALIDATION & SECURITY
  // =========================================================================
  'Validation: Multiple <body> Tags': {
    category: 'Validation',
    label: 'Multiple <body> Tags in HTML',
    severity: 'Issue',
    what: 'Checks whether the document contains more than one <body> opening tag.',
    whyIssue: 'Multiple body tags cause browser DOM parsing anomalies, breaking JavaScript hydration, analytics trackers, and CSS layout engines.',
    whyPassed: 'Document has exactly one <body> container.',
    impact: 'Broken client-side JavaScript execution and layout rendering flaws.',
    howToResolve: 'Inspect layout wrappers and CMS templates to ensure only a single `<body>...</body>` block wraps the page markup.'
  },
  'Validation: Missing <head> Tag': {
    category: 'Validation',
    label: 'Missing <head> Tag',
    severity: 'Issue',
    what: 'Checks whether the document contains a valid <head> element.',
    whyIssue: 'Without a <head> element, metadata, title, and link tags are misclassified into the body, causing crawlers to miss critical SEO directives.',
    whyPassed: 'Standard, valid `<head>` block is present.',
    impact: 'Search engines fail to read meta tags, titles, and canonical links properly.',
    howToResolve: 'Structure the HTML document with standard `<!DOCTYPE html><html><head>...</head><body>...</body></html>` format.'
  },
  'Validation: HTML Document Over 2MB': {
    category: 'Validation',
    label: 'HTML Document Size Exceeds 2MB',
    severity: 'Warning',
    what: 'Checks whether the uncompressed raw HTML document size exceeds 2 megabytes.',
    whyIssue: 'Extremely large HTML files slow down server response times (TTFB), consume excessive mobile data, and may cause Googlebot to truncate indexing at the size cutoff.',
    whyPassed: 'HTML document size is lightweight and optimized (< 2MB).',
    impact: 'Slow mobile load times, higher bounce rates, and potential truncation of page content during indexing.',
    howToResolve: 'Remove inline Base64-encoded images/fonts, externalize large inline CSS/JS scripts into separate cached assets, and minimize preloaded JSON state payloads.'
  },
  'Security: HTTP URLs': {
    category: 'Security',
    label: 'Insecure HTTP URLs (Mixed Content)',
    severity: 'Issue',
    what: 'Checks whether an insecure "http://" URL is being served or internally linked on an HTTPS domain.',
    whyIssue: 'HTTP links trigger browser security warnings ("Not Secure"), fail modern privacy standards, and violate Google\'s HTTPS ranking signal.',
    whyPassed: 'All internal assets and URLs are served securely over HTTPS.',
    impact: 'Browser security warnings, loss of user trust, and lower search rankings.',
    howToResolve: 'Update all internal links and asset references to use "https://", and configure a sitewide 301 redirect enforcing HTTPS.'
  },

  // =========================================================================
  // 9. JAVASCRIPT & RENDERING
  // =========================================================================
  'JavaScript: Pages with JavaScript Errors': {
    category: 'JavaScript',
    label: 'JavaScript Console Errors Detected',
    severity: 'Issue',
    what: 'Detects unhandled JavaScript runtime exceptions or console errors thrown during page rendering.',
    whyIssue: 'JavaScript errors can halt script execution, preventing dynamic content, pricing tables, or interactive menus from rendering for search bots.',
    whyPassed: 'Zero unhandled JavaScript runtime exceptions thrown during page execution.',
    impact: 'Incomplete content rendering by search engine bots, broken user functionality, and lower rankings.',
    howToResolve: 'Debug the browser developer console logs to fix undefined variable references, failed API calls, or third-party script conflicts.'
  }
};

/**
 * Helper to fetch a comprehensive diagnostic explanation for any check.
 *
 * @param {string} category - The category (e.g. 'Page_Titles', 'URI', 'H1', etc.)
 * @param {string} key - The specific check key (e.g. 'Over 60 Characters', 'Underscores', etc.)
 * @param {boolean|any} value - The raw evaluated value (true, false, etc.)
 * @param {object} [page] - The page object for contextual data (title_1, url, etc.)
 * @returns {object} - Structured diagnostic detail
 */
export function getDiagnosticDetail(category, key, value, page = {}) {
  // Normalize key lookup
  const compositeKey = `${category}: ${key}`;
  const def = DIAGNOSTIC_DEFINITIONS[compositeKey] || DIAGNOSTIC_DEFINITIONS[key] || null;

  const isPositiveCheck = ['Contains Canonical', 'Self Referencing', 'Index', 'Follow'].includes(key);
  const isIssue = isPositiveCheck ? (value === false || value === 'false') : (value === true || value === 'true');

  if (def) {
    let contextualWhy = '';
    if (isIssue) {
      if (key === 'Over 60 Characters' && page.title_1) {
        contextualWhy = `Detected: The page title is ${page.title_1.length} characters long ("${page.title_1.slice(0, 45)}..."), which exceeds the recommended 60-character maximum threshold.`;
      } else if (key === 'Below 30 Characters' && page.title_1) {
        contextualWhy = `Detected: The page title has only ${page.title_1.length} characters ("${page.title_1}"), which is too brief to convey full topical authority.`;
      } else if (key === 'Over 155 Characters' && page.meta_desc_1) {
        contextualWhy = `Detected: The meta description is ${page.meta_desc_1.length} characters long, which will be cut off by Google's ~155-character snippet boundary.`;
      } else if (key === 'Underscores' && page.url) {
        contextualWhy = `Detected: The URL path contains underscore characters ("_") instead of SEO-friendly hyphens ("-").`;
      } else if (key === 'Missing') {
        contextualWhy = `Detected: No <${category.toLowerCase().replace(/_/g, ' ')}> tag was detected on this page.`;
      } else if (key === 'Multiple') {
        contextualWhy = `Detected: More than one ${category.replace(/_/g, ' ')} element was rendered in the document DOM.`;
      } else {
        contextualWhy = def.whyIssue;
      }
    } else {
      contextualWhy = def.whyPassed || `Compliant: This URL passes the ${key} diagnostic check cleanly.`;
    }

    const priority = !isIssue 
      ? 'None' 
      : (def.severity === 'Issue' ? 'High' : (def.severity === 'Warning' ? 'Medium' : 'Low'));

    return {
      category: def.category || category,
      key,
      label: def.label || key,
      isIssue,
      severity: isIssue ? def.severity : 'Passed',
      priority,
      what: def.what,
      why: contextualWhy,
      searchImpact: def.impact,
      howToResolve: def.howToResolve
    };
  }

  // Fallback for unlisted dynamic keys
  const cleanLabel = key.replace(/_/g, ' ');
  return {
    category,
    key,
    label: cleanLabel,
    isIssue,
    severity: isIssue ? 'Warning' : 'Passed',
    priority: isIssue ? 'Medium' : 'None',
    what: `Evaluates the '${cleanLabel}' technical condition on this URL.`,
    why: isIssue
      ? `Condition '${cleanLabel}' was triggered as true on this page, indicating a potential configuration or markup irregularity.`
      : `Passed: No '${cleanLabel}' issue detected for this URL.`,
    searchImpact: isIssue
      ? 'May impair search engine crawling, indexation efficiency, or user experience.'
      : 'Maintains healthy website crawlability and standards compliance.',
    howToResolve: isIssue
      ? `Review the page source code and server response for ${cleanLabel} and adjust your CMS or template configuration.`
      : 'No action required. This parameter is compliant.'
  };
}

/**
 * Returns color tokens, labels, and badges for High, Medium, and Low priorities.
 */
export function getPriorityMeta(priority) {
  switch (priority) {
    case 'High':
      return {
        label: 'High Priority',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        iconColor: 'text-rose-600',
        description: 'Critical issue directly impairing indexing, crawling, or rankability'
      };
    case 'Medium':
      return {
        label: 'Medium Priority',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        iconColor: 'text-amber-600',
        description: 'Warning or technical debt degrading search performance or speed'
      };
    case 'Low':
      return {
        label: 'Low Priority',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
        iconColor: 'text-blue-600',
        description: 'Optimization opportunity or minor cosmetic/readability notice'
      };
    default:
      return {
        label: 'Passed',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        iconColor: 'text-emerald-600',
        description: 'Fully compliant with search engine quality guidelines'
      };
  }
}
