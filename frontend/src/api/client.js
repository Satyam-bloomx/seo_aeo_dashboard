import axios from 'axios';
import { supabase } from '@/lib/supabase';

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').trim().replace(/^["']|["']$/g, '');
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('Could not attach auth token to api request:', err);
  }
  return config;
});

export const getAuthToken = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
};

export const authFetch = async (url, options = {}) => {
  const token = await getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
};

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

export const getAiDiagnoseIssue = async (params) => {
  const response = await api.post('/audits/ai-diagnose-issue', params);
  return response.data;
};

export const analyzePerformance = async (url, projectId = 1) => {
  const response = await api.post('/performance/analyze', { url, project_id: projectId });
  return response.data;
};

export default api;

