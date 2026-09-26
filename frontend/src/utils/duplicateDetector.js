/**
 * Duplicate Detection & Relational Grouping Engine.
 * Identifies duplicate clusters, maps counterpart duplicate URLs,
 * and determines the Primary/Main URL vs. Duplicate URL instances.
 */

function cleanStr(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase();
}

/**
 * Returns true if a rule name signifies duplicate content/element detection.
 */
export function isDuplicateRule(ruleName) {
  if (!ruleName) return false;
  const name = String(ruleName).toLowerCase();
  return (
    name.includes('duplicate') ||
    name.includes('exact duplicate') ||
    name.includes('near duplicate')
  );
}

/**
 * Determine which page in a group of duplicate pages is the Main / Primary URL.
 * Criteria:
 * 1. Self-canonicalized page (or page pointed to by other pages' canonicals)
 * 2. Indexable over non-indexable
 * 3. Root/clean URL without query parameters ('?')
 * 4. Lower crawl depth (closer to homepage)
 * 5. Shorter URL length (e.g. /blog/ vs /blog/page/1/ or /blog/index.html)
 * 6. Lowest ID (first discovered)
 */
export function identifyMainPage(pagesInCluster) {
  if (!pagesInCluster || pagesInCluster.length === 0) return null;
  if (pagesInCluster.length === 1) return pagesInCluster[0];

  // Look for a page that is self-canonicalized
  const selfCanonical = pagesInCluster.find(
    p => p.canonical_link_element_1 && p.canonical_link_element_1 === p.url
  );
  if (selfCanonical) return selfCanonical;

  // Look for a page that other pages point their canonicals to
  const canonicalTargets = pagesInCluster
    .map(p => p.canonical_link_element_1)
    .filter(Boolean);
  const pointedTarget = pagesInCluster.find(p => canonicalTargets.includes(p.url));
  if (pointedTarget) return pointedTarget;

  // Score each page based on authority signals
  const scored = [...pagesInCluster].map(page => {
    let score = 0;
    const url = page.url || '';

    // Indexable status
    if (page.indexability === 'Indexable' || String(page.indexability).includes('INDEXABLE')) {
      score += 20;
    }
    // No query parameters
    if (!url.includes('?') && !url.includes('#')) {
      score += 15;
    }
    // Lower crawl depth
    score += Math.max(0, 10 - (page.crawl_depth || 0) * 2);
    // Prefer shorter URL
    score -= Math.min(20, Math.floor(url.length / 10));

    return { page, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.page || pagesInCluster[0];
}

/**
 * Group pages into duplicate clusters for a specific issue rule.
 * Returns an array of clusters:
 * [
 *   {
 *     clusterKey: string,
 *     categoryLabel: string,
 *     sharedValue: string,
 *     mainPage: object,
 *     duplicates: [object, ...],
 *     allPages: [object, ...]
 *   }
 * ]
 */
export function buildDuplicateClusters(affectedPages, ruleName, allCrawlPages = []) {
  if (!affectedPages || affectedPages.length === 0) return [];

  const normRule = String(ruleName || '').toLowerCase();
  const clustersMap = new Map();

  const getClusterKey = (p) => {
    if (normRule.includes('title')) {
      return {
        key: cleanStr(p.title_1),
        label: 'Shared Page Title',
        val: p.title_1 || '(Blank Title)'
      };
    }
    if (normRule.includes('meta description')) {
      return {
        key: cleanStr(p.meta_desc_1),
        label: 'Shared Meta Description',
        val: p.meta_desc_1 || '(Blank Description)'
      };
    }
    if (normRule.includes('h1')) {
      return {
        key: cleanStr(p.h1_1),
        label: 'Shared H1 Heading',
        val: p.h1_1 || '(Blank H1)'
      };
    }
    if (normRule.includes('h2')) {
      return {
        key: cleanStr(p.h2_1),
        label: 'Shared H2 Heading',
        val: p.h2_1 || '(Blank H2)'
      };
    }
    if (normRule.includes('exact duplicate')) {
      const hash = p.content_hash || p.audit_data?.Content?.content_hash;
      if (hash) {
        return {
          key: `hash_${hash}`,
          label: 'Exact Content Hash (100% Match)',
          val: `MD5: ${hash}`
        };
      }
      // Fallback: title + word count
      return {
        key: `body_${cleanStr(p.title_1)}_${p.word_count || 0}`,
        label: 'Exact Duplicate Content',
        val: `${p.title_1 || 'Page'} (${p.word_count || 0} words)`
      };
    }
    if (normRule.includes('near duplicate')) {
      return {
        key: cleanStr(p.h1_1 || p.title_1),
        label: 'Near Duplicate Content (>=85% Match)',
        val: p.h1_1 || p.title_1 || 'Near Duplicate'
      };
    }

    // Default fallback
    return {
      key: cleanStr(p.title_1 || p.url),
      label: 'Duplicate Group',
      val: p.title_1 || p.url
    };
  };

  // Group pages by key
  affectedPages.forEach(page => {
    const { key, label, val } = getClusterKey(page);
    if (!key) return;

    if (!clustersMap.has(key)) {
      clustersMap.set(key, {
        clusterKey: key,
        categoryLabel: label,
        sharedValue: val,
        pages: []
      });
    }
    clustersMap.get(key).pages.push(page);
  });

  // Also include any sibling pages from audit_data or allCrawlPages if they were missing from affectedPages
  const urlToPageMap = new Map();
  (allCrawlPages || []).forEach(p => {
    if (p.url) urlToPageMap.set(p.url, p);
  });

  const clusters = [];
  clustersMap.forEach((entry) => {
    let groupPages = [...entry.pages];

    // If backend provided duplicate_urls, ensure counterpart pages are added
    entry.pages.forEach(p => {
      let backendSiblings = [];
      if (normRule.includes('title')) {
        backendSiblings = p.audit_data?.Page_Titles?.duplicate_urls || [];
      } else if (normRule.includes('meta description')) {
        backendSiblings = p.audit_data?.Meta_Description?.duplicate_urls || [];
      } else if (normRule.includes('h1')) {
        backendSiblings = p.audit_data?.H1?.duplicate_urls || [];
      } else if (normRule.includes('h2')) {
        backendSiblings = p.audit_data?.H2?.duplicate_urls || [];
      } else if (normRule.includes('exact duplicate')) {
        backendSiblings = p.audit_data?.Content?.exact_duplicate_urls || p.audit_data?.Content?.duplicate_urls || [];
      } else if (normRule.includes('near duplicate')) {
        backendSiblings = p.audit_data?.Content?.near_duplicate_urls || [];
      }

      backendSiblings.forEach(url => {
        if (!groupPages.some(gp => gp.url === url)) {
          const siblingObj = urlToPageMap.get(url) || { url, status_code: 200 };
          groupPages.push(siblingObj);
        }
      });
    });

    // Remove duplicate entries of same URL
    const uniqueMap = new Map();
    groupPages.forEach(p => {
      if (p.url && !uniqueMap.has(p.url)) {
        uniqueMap.set(p.url, p);
      }
    });
    groupPages = Array.from(uniqueMap.values());

    const mainPage = identifyMainPage(groupPages);
    const duplicates = groupPages.filter(p => p.url !== mainPage?.url);

    clusters.push({
      clusterKey: entry.clusterKey,
      categoryLabel: entry.categoryLabel,
      sharedValue: entry.sharedValue,
      mainPage,
      duplicates,
      allPages: groupPages,
      totalCount: groupPages.length
    });
  });

  // Sort clusters by count descending
  clusters.sort((a, b) => b.totalCount - a.totalCount);
  return clusters;
}

/**
 * Returns all duplicate relationships for a single inspected page.
 * Used by URL Inspector Drawer and URLExplorerTab tooltips.
 */
export function getPageDuplicateRelationships(page, allPages = []) {
  if (!page || !page.url) {
    return { hasDuplicates: false, relationships: [] };
  }

  const relationships = [];
  const ad = page.audit_data || {};
  const currentUrl = page.url;

  // Helper to build counterpart items
  const buildCounterparts = (urls, sharedVal) => {
    return (urls || [])
      .filter(u => u && u !== currentUrl)
      .map(url => {
        const found = (allPages || []).find(p => p.url === url);
        return {
          url,
          statusCode: found?.status_code || 200,
          indexability: found?.indexability || 'Indexable',
          wordCount: found?.word_count,
          canonical: found?.canonical_link_element_1,
          pageObj: found
        };
      });
  };

  // 1. Exact Duplicate Content
  let exactUrls = ad.Content?.exact_duplicate_urls || ad.Content?.duplicate_urls || [];
  if (exactUrls.length === 0 && ad.Content?.['Exact Duplicates']) {
    // Search in allPages by content_hash or exact title + word count
    const cHash = page.content_hash || ad.Content?.content_hash;
    allPages.forEach(p => {
      if (p.url !== currentUrl) {
        if (cHash && (p.content_hash === cHash || p.audit_data?.Content?.content_hash === cHash)) {
          exactUrls.push(p.url);
        } else if (
          p.word_count &&
          page.word_count &&
          p.word_count === page.word_count &&
          cleanStr(p.title_1) === cleanStr(page.title_1) &&
          cleanStr(p.title_1) !== ''
        ) {
          exactUrls.push(p.url);
        }
      }
    });
  }

  if (exactUrls.length > 0) {
    const counterparts = buildCounterparts([...new Set(exactUrls)]);
    if (counterparts.length > 0) {
      relationships.push({
        id: 'exact-content',
        category: 'Content',
        type: 'Exact Duplicate Content',
        badge: 'Exact Duplicate',
        badgeColor: 'rose',
        sharedLabel: 'Matching Content',
        sharedValue: page.content_hash ? `Content Hash: ${page.content_hash}` : `${page.word_count || 0} words & identical body markup`,
        counterparts
      });
    }
  }

  // 2. Near Duplicate Content
  let nearUrls = ad.Content?.near_duplicate_urls || [];
  if (nearUrls.length === 0 && ad.Content?.['Near Duplicates']) {
    const cleanH1 = cleanStr(page.h1_1);
    if (cleanH1) {
      allPages.forEach(p => {
        if (p.url !== currentUrl && cleanStr(p.h1_1) === cleanH1) {
          const w1 = page.word_count || 1;
          const w2 = p.word_count || 1;
          if (min(w1, w2) / max(w1, w2) >= 0.85) {
            nearUrls.push(p.url);
          }
        }
      });
    }
  }

  if (nearUrls.length > 0) {
    const counterparts = buildCounterparts([...new Set(nearUrls)]);
    if (counterparts.length > 0) {
      relationships.push({
        id: 'near-content',
        category: 'Content',
        type: 'Near Duplicate Content',
        badge: 'Near Duplicate (>=85%)',
        badgeColor: 'amber',
        sharedLabel: 'Shared H1 & Content Volume',
        sharedValue: page.h1_1 || `${page.word_count || 0} words`,
        counterparts
      });
    }
  }

  // 3. Duplicate Page Titles
  let titleUrls = ad.Page_Titles?.duplicate_urls || [];
  if (titleUrls.length === 0 && (ad.Page_Titles?.Duplicate || page.title_1)) {
    const cleanT = cleanStr(page.title_1);
    if (cleanT) {
      allPages.forEach(p => {
        if (p.url !== currentUrl && cleanStr(p.title_1) === cleanT) {
          titleUrls.push(p.url);
        }
      });
    }
  }

  if (titleUrls.length > 0) {
    const counterparts = buildCounterparts([...new Set(titleUrls)]);
    if (counterparts.length > 0) {
      relationships.push({
        id: 'duplicate-title',
        category: 'Page_Titles',
        type: 'Duplicate Page Title',
        badge: 'Duplicate Title',
        badgeColor: 'amber',
        sharedLabel: 'Shared Title Tag',
        sharedValue: page.title_1 || '',
        counterparts
      });
    }
  }

  // 4. Duplicate H1 Headings
  let h1Urls = ad.H1?.duplicate_urls || [];
  if (h1Urls.length === 0 && (ad.H1?.Duplicate || page.h1_1)) {
    const cleanH = cleanStr(page.h1_1);
    if (cleanH) {
      allPages.forEach(p => {
        if (p.url !== currentUrl && cleanStr(p.h1_1) === cleanH) {
          h1Urls.push(p.url);
        }
      });
    }
  }

  if (h1Urls.length > 0) {
    const counterparts = buildCounterparts([...new Set(h1Urls)]);
    if (counterparts.length > 0) {
      relationships.push({
        id: 'duplicate-h1',
        category: 'H1',
        type: 'Duplicate H1 Heading',
        badge: 'Duplicate H1',
        badgeColor: 'amber',
        sharedLabel: 'Shared H1 Text',
        sharedValue: page.h1_1 || '',
        counterparts
      });
    }
  }

  // 5. Duplicate Meta Description
  let descUrls = ad.Meta_Description?.duplicate_urls || [];
  if (descUrls.length === 0 && (ad.Meta_Description?.Duplicate || page.meta_desc_1)) {
    const cleanD = cleanStr(page.meta_desc_1);
    if (cleanD) {
      allPages.forEach(p => {
        if (p.url !== currentUrl && cleanStr(p.meta_desc_1) === cleanD) {
          descUrls.push(p.url);
        }
      });
    }
  }

  if (descUrls.length > 0) {
    const counterparts = buildCounterparts([...new Set(descUrls)]);
    if (counterparts.length > 0) {
      relationships.push({
        id: 'duplicate-meta-desc',
        category: 'Meta_Description',
        type: 'Duplicate Meta Description',
        badge: 'Duplicate Meta Description',
        badgeColor: 'blue',
        sharedLabel: 'Shared Meta Description',
        sharedValue: page.meta_desc_1 || '',
        counterparts
      });
    }
  }

  return {
    hasDuplicates: relationships.length > 0,
    relationships
  };
}

function min(a, b) {
  return a < b ? a : b;
}

function max(a, b) {
  return a > b ? a : b;
}
