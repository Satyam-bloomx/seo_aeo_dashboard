class CheckResult:
    def __init__(self, category, audit_type, issue, business_impact, how_to_fix, severity="Notice", status="passed", evidence=None, details=None):
        self.category = category
        self.audit_type = audit_type
        self.issue = issue
        self.business_impact = business_impact
        self.how_to_fix = how_to_fix
        self.severity = severity # "Error", "Warning", "Notice"
        self.status = status
        self.evidence = evidence
        self.details = details or []

    def to_dict(self):
        return {
            "category": self.category,
            "audit_type": self.audit_type,
            "issue": self.issue,
            "business_impact": self.business_impact,
            "how_to_fix": self.how_to_fix,
            "severity": self.severity,
            "priority": self.severity, # keep for backwards compat temporarily
            "status": self.status,
            "evidence": self.evidence,
            "details": self.details
        }

def evaluate_audits(raw_data):
    checks = []
    
    main_pages = raw_data.get("main_pages", [])
    primary = main_pages[0] if main_pages else {}
    
    seo = primary.get("seo_audit", {})
    aeo = primary.get("aeo_audit", {})
    geo = primary.get("geo_audit", {})
    ai = primary.get("ai_tracking", {})
    crawl = raw_data.get("crawl_audit", {})
    url = primary.get("url", raw_data.get("url", ""))
    
    # === SEO CHECKS ===
    
    # Status Code
    status_code = seo.get("fetch_metrics", {}).get("status_code")
    if status_code == 200:
        checks.append(CheckResult("Technical", "SEO", "Website returns 200 OK status", "Ensures site is accessible", "N/A", status="passed", evidence=f"Status: {status_code}"))
    else:
        checks.append(CheckResult("Technical", "SEO", "Website returned a non-200 status code.", "Search engines cannot crawl broken pages, resulting in lost traffic.", "Check your server configuration and ensure the URL doesn't redirect or return an error.", "Error", "failed", f"Status Code: {status_code}"))

    # H1 Count
    h1_count = seo.get("on_page", {}).get("h1_count", 0)
    h1_tags = seo.get("on_page", {}).get("h1_tags", [])
    if h1_count == 1:
        checks.append(CheckResult("Meta", "SEO", "Exactly 1 H1 tag found", "Optimal for page structure", "N/A", status="passed", evidence="H1 count is 1"))
    elif h1_count == 0:
        checks.append(CheckResult("Meta", "SEO", "Missing H1 heading on the page.", "Pages without H1 rank 20-30% lower on average.", "Add an <h1> tag to your page containing your primary keyword.", "Error", "failed", "H1 Count: 0"))
    else:
        details = [{"page_url": url, "element": "<h1>", "issue": "Multiple H1 tags", "context": h} for h in h1_tags]
        checks.append(CheckResult("Meta", "SEO", f"{h1_count} H1 tags found (should be exactly 1)", "Multiple H1s can confuse search engines about the primary topic.", "Ensure only one <h1> tag is present on the page.", "Error", "failed", f"H1 Count: {h1_count}", details=details))
        
    # Title Tag Length
    title = seo.get("on_page", {}).get("title")
    if title:
        t_len = len(title)
        if 20 <= t_len <= 70:
            checks.append(CheckResult("Meta", "SEO", "Title tag length is optimal (20-70 chars)", "Optimal length increases CTR", "N/A", status="passed", evidence=f"Length: {t_len} chars"))
        else:
            severity = "Warning" if t_len < 10 or t_len > 80 else "Notice"
            issue = f"Title length: {t_len} characters ({'too long' if t_len > 70 else 'too short'}, aim for 20-70)"
            checks.append(CheckResult("Meta", "SEO", issue, "Optimal length increases CTR by 15-20%", "Rewrite title to 20-70 characters. Include primary keyword in first 30 chars.", severity, "failed", evidence=f"Found: {title}"))
    else:
        checks.append(CheckResult("Meta", "SEO", "Missing Title tag", "Critical for ranking and CTR", "Add a <title> tag to the <head>.", "Error", "failed"))
        
    # Meta Description Length
    meta_desc = seo.get("on_page", {}).get("meta_description")
    if meta_desc:
        m_len = len(meta_desc)
        if 50 <= m_len <= 160:
            checks.append(CheckResult("Meta", "SEO", "Meta description length is optimal", "Good CTR", "N/A", status="passed"))
        else:
            severity = "Notice"
            issue = f"Description length: {m_len} chars ({'too long' if m_len > 160 else 'too short'})"
            checks.append(CheckResult("Meta", "SEO", issue, "Optimal length can increase CTR by 10-15%", "Rewrite description to 120-160 characters. Include call-to-action.", severity, "failed", evidence=f"Found: {meta_desc[:50]}..."))
    else:
         checks.append(CheckResult("Meta", "SEO", "Missing Meta Description", "Critical for CTR", "Add a meta description tag.", "Warning", "failed"))
        
    # Robots.txt
    googlebot = seo.get("robots", {}).get("googlebot_allowed")
    if googlebot:
        checks.append(CheckResult("Technical", "SEO", "Googlebot allowed in robots.txt", "Allows crawling", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Technical", "SEO", "Googlebot is blocked from crawling the site.", "Search engines must be allowed to crawl your site to index it.", "Remove the 'Disallow: /' directive for Googlebot in your robots.txt file.", "Error", "failed"))
        
    # Security HTTPS
    is_https = seo.get("security", {}).get("is_https")
    valid_cert = seo.get("security", {}).get("valid_cert")
    if is_https and valid_cert:
        checks.append(CheckResult("Security", "SEO", "HTTPS enabled and certificate valid", "Security signals contribute to E-E-A-T", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Security", "SEO", "Missing or invalid SSL Certificate (HTTPS).", "Users see 'Not Secure' warnings; Google ranks HTTP lower.", "Install an SSL certificate on your web server and redirect all HTTP traffic to HTTPS.", "Error", "failed"))

    # Alt Text
    alt_cov = seo.get("media", {}).get("alt_coverage_percentage", 0)
    missing_alts = seo.get("media", {}).get("images_missing_alt", [])
    if alt_cov == 100:
        checks.append(CheckResult("Content", "SEO", "All images have ALT text", "Improves accessibility and image search ranking", "N/A", status="passed"))
    elif alt_cov >= 80:
        checks.append(CheckResult("Content", "SEO", f"{alt_cov}% images have ALT text", "Good coverage", "N/A", status="passed"))
    else:
        details = [{"page_url": url, "element": "<img>", "issue": "Missing Alt Attribute", "context": src} for src in missing_alts]
        checks.append(CheckResult("Content", "SEO", "Images are missing Alt Text.", "Target >80% alt text coverage so search engines can 'read' your images.", "Add descriptive <img alt='...'> tags to all important images on the page.", "Warning", "failed", evidence=f"Coverage: {alt_cov}%", details=details))

    # Modern Image Formats
    modern_img = seo.get("media", {}).get("modern_format_percentage", 0)
    total_imgs = seo.get("media", {}).get("total_images", 0)
    if total_imgs > 0:
        if modern_img >= 80:
            checks.append(CheckResult("Content", "SEO", f"{modern_img}% of images use modern formats (WebP/AVIF)", "Faster load times", "N/A", status="passed"))
        else:
            checks.append(CheckResult("Content", "SEO", "Low usage of modern image formats.", "WebP and AVIF compress images 30% smaller than JPG/PNG.", "Convert images to WebP or AVIF formats.", "Notice", "failed", evidence=f"{modern_img}% modern formats"))

        # Lazy Loading
        lazy_loading = seo.get("media", {}).get("lazy_loading_percentage", 0)
        if lazy_loading >= 80:
            checks.append(CheckResult("Performance", "SEO", f"{lazy_loading}% of images use lazy loading", "Conserves bandwidth and improves TTFB", "N/A", status="passed"))
        else:
            checks.append(CheckResult("Performance", "SEO", "Images are missing lazy loading attributes.", "Off-screen images should not load until the user scrolls near them.", "Add loading='lazy' to all images below the fold.", "Notice", "failed", evidence=f"Coverage: {lazy_loading}%"))

    # Accessibility (a11y)
    a11y = seo.get("a11y", {})
    a11y_score = a11y.get("a11y_score", 100)
    if a11y_score == 100:
        checks.append(CheckResult("On-Page", "SEO", "All links and buttons are accessible", "Improves usability for screen readers and search bots", "N/A", status="passed"))
    else:
        issues = a11y.get("issues", [])
        details = [{"page_url": url, "element": "Link/Button", "issue": "Missing ARIA label or text", "context": issue.replace("Missing text/aria-label: ", "")} for issue in issues]
        checks.append(CheckResult("On-Page", "SEO", "Inaccessible links or buttons found.", "Screen readers and search engines cannot understand links without text or aria-labels.", "Ensure all <a> and <button> tags contain text or an aria-label.", "Warning", "failed", evidence=f"Score: {a11y_score}%", details=details))

    # Pagespeed
    p_score = seo.get("pagespeed", {}).get("mobile", {}).get("performance_score")
    if p_score is not None:
        if p_score >= 90:
            checks.append(CheckResult("Technical", "SEO", f"Performance score is excellent ({p_score})", "Fast loading improves rankings and user experience", "N/A", status="passed"))
        else:
            severity = "Error" if p_score < 50 else "Warning"
            checks.append(CheckResult("Technical", "SEO", "Slow page load times (Core Web Vitals).", "Slow loading = 10-20% higher bounce rate.", "Optimize images, minimize main-thread work, and reduce render-blocking resources.", severity, "failed", evidence=f"Score: {p_score}"))

    # Meta Robots
    meta_robots = seo.get("on_page", {}).get("meta_robots")
    if meta_robots and ("noindex" in meta_robots or "nofollow" in meta_robots):
        checks.append(CheckResult("Technical", "SEO", "Page is blocked by meta robots (noindex/nofollow).", "Search engines will not index this page or follow its links.", "Remove noindex/nofollow from the robots meta tag if this page should be indexed.", "Error", "failed", evidence=f"Robots: {meta_robots}"))
    else:
        checks.append(CheckResult("Technical", "SEO", "Meta robots allows indexing", "Search engines can index the page", "N/A", status="passed"))
        
    # Social Tags
    social = seo.get("on_page", {}).get("social_tags", {})
    has_og = social.get("has_og_title") and social.get("has_og_desc")
    has_twitter = social.get("has_twitter_card")
    if has_og and has_twitter:
        checks.append(CheckResult("Meta", "SEO", "Social tags (OpenGraph & Twitter) present", "Optimal presentation when shared on social media", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Meta", "SEO", "Missing OpenGraph or Twitter Card tags.", "Links shared on social media won't have rich previews, lowering CTR.", "Add standard og:title, og:description, og:image and twitter:card meta tags.", "Notice", "failed"))
        
    # Favicon
    has_favicon = seo.get("on_page", {}).get("has_favicon")
    if has_favicon:
        checks.append(CheckResult("Security", "SEO", "Favicon is present", "Improves brand recognition", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Security", "SEO", "Missing Favicon.", "A favicon helps brand recognition and trust.", "Add a <link rel='icon'>.", "Notice", "failed"))
        
    # Mobile Viewport
    has_viewport = seo.get("on_page", {}).get("has_viewport")
    if has_viewport:
        checks.append(CheckResult("Architecture", "SEO", "Mobile viewport is correctly configured", "Essential for mobile rendering", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Architecture", "SEO", "Missing Mobile Viewport Meta Tag.", "Without a viewport tag, pages will render poorly on mobile.", "Add <meta name='viewport' content='width=device-width, initial-scale=1'>.", "Error", "failed"))
        
    # Word Count
    word_count = seo.get("on_page", {}).get("word_count", 0)
    p_count = seo.get("on_page", {}).get("paragraph_count", 0)
    if word_count > 300:
        checks.append(CheckResult("Content", "SEO", f"Good content length ({word_count} words, {p_count} paragraphs)", "Sufficient content depth", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Content", "SEO", "Thin content detected.", "Pages with under 300 words struggle to rank or provide value to AI.", "Expand on the topic to provide comprehensive value.", "Warning", "failed", evidence=f"{word_count} words"))
        
    # === AEO CHECKS ===
    readability = aeo.get("readability", {})
    if readability.get("is_optimal_for_aeo"):
        checks.append(CheckResult("Content", "AEO", "Readability is optimal for AI (8th-10th grade)", "Easy for Siri/Alexa to read out loud", "N/A", status="passed"))
    else:
        grade = readability.get("flesch_kincaid_grade")
        if grade:
            checks.append(CheckResult("Content", "AEO", "Content reading level is too complex for Voice Assistants.", "Voice assistants will struggle to read this page.", "Rewrite text to an 8th-grade reading level.", "Warning", "failed", evidence=f"Readability Score: {grade}"))

    structure = aeo.get("content_structure", {})
    if structure.get("direct_answers_found", 0) > 0:
        checks.append(CheckResult("Content", "AEO", "Direct Answer/FAQ structure found", "Ideal for AI snippets", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Content", "AEO", "No direct Answer/FAQ structure found.", "Help LLMs extract quick answers for user queries.", "Format key sections as H2/H3 questions followed immediately by a concise answer.", "Notice", "failed"))

    auth = aeo.get("authority_signals", {})
    if auth.get("passes_basic_eeat"):
        checks.append(CheckResult("Content", "AEO", "Authority signals (E-E-A-T) detected", "Builds trust with AI", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Content", "AEO", "Missing Authority Signals (E-E-A-T).", "Establish trust so AI engines feel safe citing your content.", "Add an author bio block, link to a detailed About Us page.", "Warning", "failed"))
        
    # === GEO CHECKS ===
    bot_access = geo.get("bot_access", {})
    if bot_access.get("GPTBot_allowed"):
        checks.append(CheckResult("Technical", "GEO", "GPTBot is allowed", "Enables LLM scraping", "N/A", status="passed"))
    else:
        checks.append(CheckResult("Technical", "GEO", "GPTBot is blocked in robots.txt.", "Allow major AI models to scrape your site.", "Explicitly allow User-agent: GPTBot in robots.txt.", "Error", "failed"))

    ai_files = geo.get("ai_files", {})
    if ai_files.get("has_llms_txt"):
        checks.append(CheckResult("Technical", "GEO", "llms.txt file found", "Actively welcomes and guides AI scrapers", "N/A", "Notice", status="passed", evidence=ai_files.get("llms_txt_url")))
    else:
        checks.append(CheckResult("Technical", "GEO", "Missing llms.txt file.", "An llms.txt helps guide AI agents to your most important content.", "Create an llms.txt at the root of your domain.", "Notice", "failed"))

    # Schema
    schema_types = seo.get("schema_types", [])
    has_faq_or_article = any(t in schema_types for t in ["FAQPage", "Article", "Organization"] if isinstance(t, str))
    if has_faq_or_article:
        checks.append(CheckResult("Technical", "GEO", "High-value schema (FAQ/Article/Organization) found", "Explicitly defines content meaning for AI crawlers", "N/A", "Notice", "passed", evidence=f"Found: {', '.join(schema_types)}"))
    else:
        checks.append(CheckResult("Technical", "GEO", "Missing high-value schema markup.", "AI Overviews rely on schema to understand context.", "Add JSON-LD schema markup.", "Notice", "failed"))

    # AI Mentions & Visibility (AEO/GEO via Gemini)
    if ai and ai.get("status") == "success":
        brand = ai.get("extracted_brand", "your brand")
        query = ai.get("target_query", "a related query")
        if ai.get("is_cited"):
            checks.append(CheckResult("Authority", "GEO", f"AI Engines cite {brand} for target queries", f"When asked about '{query}', the AI successfully recommended or mentioned your brand.", "N/A", "Notice", "passed", evidence=f"Query: {query}"))
        else:
            checks.append(CheckResult("Authority", "GEO", f"Brand not cited by AI for target queries.", f"When asked '{query}', the AI engine did not mention {brand}.", "Increase digital PR, brand mentions.", "Notice", "failed", evidence=f"Query: {query}"))

    # === CRAWLER ===
    broken_count = crawl.get("broken_internal_links")
    if broken_count == 0:
        checks.append(CheckResult("Architecture", "SEO", "All checked internal links are working", "Good link equity flow", "N/A", status="passed"))
    elif broken_count is not None and broken_count > 0:
        broken_details = crawl.get("broken_details", [])
        details = [{"page_url": b["url"], "element": "Link", "issue": f"Status {b['status']}", "context": b["url"]} for b in broken_details]
        checks.append(CheckResult("Architecture", "SEO", "Broken internal links detected.", "Ensure search engine crawlers don't hit dead ends.", "Fix or remove any links returning 404/500 errors.", "Error", "failed", evidence=f"Broken: {broken_count}", details=details))

    # Orphan Pages
    sitemap_found = crawl.get("sitemap_found")
    if sitemap_found:
        orphans = crawl.get("orphan_pages", [])
        if orphans:
            details = [{"page_url": o, "element": "Page", "issue": "No internal links point to this page", "context": o} for o in orphans]
            checks.append(CheckResult("Architecture", "SEO", f"{len(orphans)} Orphan pages detected.", "Pages with zero internal links pointing to them will not rank well.", "Add internal links to these pages from relevant content.", "Warning", "failed", details=details))
        
    # === AGGREGATED HYBRID CRAWL CHECKS ===
    fast_audits = crawl.get("fast_audits", [])
    if fast_audits:
        h1_details = []
        alt_details = []
        read_details = []
        
        for fa in fast_audits:
            fa_seo = fa.get("seo", {})
            h1_count = fa_seo.get("on_page", {}).get("h1_count", 0)
            if h1_count != 1:
                h1_tags = fa_seo.get("on_page", {}).get("h1_tags", [])
                h1_details.append({
                    "page_url": fa["url"],
                    "element": "<h1>",
                    "issue": f"Found {h1_count} H1 tags",
                    "context": " | ".join(h1_tags) if h1_tags else "Missing H1"
                })
            
            missing_alts = fa_seo.get("media", {}).get("images_missing_alt", [])
            for alt in missing_alts:
                alt_details.append({
                    "page_url": fa["url"],
                    "element": "<img>",
                    "issue": "Missing alt attribute",
                    "context": alt
                })
                
            grade = fa.get("aeo", {}).get("readability", {}).get("flesch_kincaid_grade")
            if grade and grade > 10.9:
                read_details.append({
                    "page_url": fa["url"],
                    "element": "Text",
                    "issue": "Poor readability",
                    "context": f"Grade: {grade}"
                })
            
        if h1_details:
            checks.append(CheckResult("Architecture", "SEO", f"H1 Tag Issues across subpages", "Subpages need exactly 1 H1 tag for optimal ranking.", "Fix H1 tags on these pages.", "Warning", "failed", evidence=f"{len(h1_details)} issues found", details=h1_details))
            
        if alt_details:
            checks.append(CheckResult("Architecture", "SEO", f"Missing Alt Text on subpages", "Images without alt text hurt accessibility and image SEO.", "Add descriptive alt text.", "Warning", "failed", evidence=f"{len(alt_details)} images missing alt text", details=alt_details))

        if read_details:
            checks.append(CheckResult("Content", "AEO", f"Poor readability across subpages", "Voice assistants struggle to read complex text.", "Rewrite text to an 8th-grade level.", "Warning", "failed", evidence=f"{len(read_details)} pages affected", details=read_details))

    # Calculate Summary using Weighted Average
    passed_checks = [c.to_dict() for c in checks if c.status == "passed"]
    failed_checks = [c.to_dict() for c in checks if c.status == "failed"]
    
    total_checks = len(checks)
    passed_count = len(passed_checks)
    failed_count = len(failed_checks)
    
    priority_dist = {"Error": 0, "Warning": 0, "Notice": 0}
    for c in failed_checks:
        p = c["severity"]
        if p in priority_dist:
            priority_dist[p] += 1
            
    def calc_score(audit_type):
        type_checks = [c for c in checks if c.audit_type == audit_type]
        if not type_checks: return 0
        
        weights = {
            "Error": 3,
            "Warning": 2,
            "Notice": 1
        }
        
        total_possible_weight = 0
        earned_weight = 0
        
        for c in type_checks:
            w = weights.get(c.severity, 1)
            total_possible_weight += w
            if c.status == "passed":
                earned_weight += w
                
        if total_possible_weight == 0:
            return 100
            
        return int((earned_weight / total_possible_weight) * 100)

    seo_score = calc_score("SEO")
    aeo_score = calc_score("AEO")
    geo_score = calc_score("GEO")
    
    overall = int((seo_score + aeo_score + geo_score) / 3) if total_checks > 0 else 0

    return {
        "summary": {
            "overall_score": overall,
            "seo_score": seo_score,
            "aeo_score": aeo_score,
            "geo_score": geo_score,
            "total_checks": total_checks,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "priority_distribution": priority_dist
        },
        "failed_checks": failed_checks,
        "passed_checks": passed_checks,
        "raw_data": raw_data
    }
