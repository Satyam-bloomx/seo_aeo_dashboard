import { create } from 'zustand';

export const useCrawlStore = create((set) => ({
  activeCrawlId: null,
  activeTab: 'internal', // internal, external, response_codes, etc.
  selectedPageId: null,
  
  setActiveCrawlId: (id) => set({ activeCrawlId: id }),
  setActiveTab: (tab) => set({ activeTab: tab, selectedPageId: null }),
  setSelectedPageId: (id) => set({ selectedPageId: id }),
}));
