import axios from 'axios';

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').trim().replace(/^["']|["']$/g, '');
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const startCrawl = async (seedUrl, maxDepth = 100, maxPages = 500) => {
  const response = await api.post('/crawls', { seed_url: seedUrl, max_depth: maxDepth, max_pages: maxPages });
  return response.data;
};

export const getCrawlStatus = async (crawlId) => {
  const response = await api.get(`/crawls/${crawlId}/status`);
  return response.data;
};

export const getPages = async (crawlId, filter = 'internal', skip = 0, limit = 100) => {
  const response = await api.get(`/crawls/${crawlId}/pages`, { params: { filter, skip, limit } });
  return response.data;
};

export const getInlinks = async (pageId) => {
  const response = await api.get(`/pages/${pageId}/inlinks`);
  return response.data;
};

export const getOutlinks = async (pageId) => {
  const response = await api.get(`/pages/${pageId}/outlinks`);
  return response.data;
};

export const getAiRemediation = async (params) => {
  const response = await api.post('/audits/ai-remediate', params);
  return response.data;
};

export const getAiExecutiveSummary = async (params) => {
  const response = await api.post('/audits/ai-executive-summary', params);
  return response.data;
};

export const analyzePerformance = async (url, projectId = 1) => {
  const response = await api.post('/performance/analyze', { url, project_id: projectId });
  return response.data;
};

export default api;

