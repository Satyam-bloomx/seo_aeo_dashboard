// An engine that replicates Screaming Frog's exact rule logic dynamically based on parameter_ex.md.
// Evaluates the array of pages and returns aggregated issues.

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
    category: 'Response_Codes',
    type: 'Issue',
    priority: 'High',
    evaluate: (page) => page.status_code >= 400 && page.status_code < 500
  },
  {
    name: 'Response Codes: Server Error (5xx)',
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
     
     RULES.push({
         name: `${category.replace(/_/g, ' ')}: ${ruleName}`,
         category: category,
         type: type,
         priority: priority,
         evaluate: (page) => {
             const val = page.audit_data?.[category]?.[ruleName];
             return val === true;
         }
     });
  });
});

export function generateIssuesReport(pages) {
  if (!pages || pages.length === 0) return [];
  const report = RULES.map(rule => ({
    ...rule,
    affected_pages: [],
    count: 0,
    percentage: 0
  }));

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
