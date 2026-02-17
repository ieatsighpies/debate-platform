import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
console.log(`[API Service] Using API URL: ${API_URL}`);
// Create instance with interceptor
const api = axios.create({
  baseURL: API_URL
});

// Auto-attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.clear();
      navigate(`/login`, { replace: true });
    }
    return Promise.reject(error);
  }
);

// All API calls
export const debateAPI = {
  getTopics: () => api.get('/api/debates/topics'),
  joinDebate: (data) => api.post('/api/debates/join', data),
  getDebate: (id) => api.get(`/api/debates/${id}`),
  submitArgument: (id, text) => api.post(`/api/debates/${id}/argument`, { text }),
  getAllDebates: () => api.get('/api/debates/all-debates'),
  getAIPersonalities: () => api.get('/api/debates/ai-personalities'),
  getAIPersonalityDetails: (id) => api.get(`/api/debates/ai-personalities/${id}`),
  matchDebateWithAI: (id, data) => api.post(`/api/debates/${id}/match-ai`, data),
  updateAIControl: (id, aiEnabled) => api.put(`/api/debates/${id}/ai-control`, { aiEnabled }),
  triggerAIResponse: (id) => api.post(`/api/debates/${id}/trigger-ai`),
  endDebateEarly: (id) => api.put(`/api/debates/${id}/end-early`),
  cancelDebate: (debateId) => api.delete(`/api/debates/${debateId}/cancel`),
  voteEarlyEnd: (debateId) => api.post(`/api/debates/${debateId}/vote-end`),
  revokeEarlyEndVote: (debateId) => api.post(`/api/debates/${debateId}/revoke-vote`),
  getMyStatus: () => api.get('/api/debates/my-status'),
  submitPreSurvey: (debateId, response) =>
    api.post(`/api/debates/${debateId}/pre-survey`, { response }),
  submitPostSurvey: (debateId, response) =>
    api.post(`/api/debates/${debateId}/post-survey`, response ),
  submitBeliefUpdate: (debateId, payload) =>
    api.post(`/api/debates/${debateId}/belief-update`, payload),
  submitBeliefSkip: (debateId, payload) =>
    api.post(`/api/debates/${debateId}/belief-skip`, payload),
  getDebateAnalytics: (debateId) => api.get(`/api/debates/${debateId}/analytics`),
  submitReflection: (debateId, payload) =>
    api.post(`/api/debates/${debateId}/reflection`, payload),
};

export const authAPI = {
login: (username, password) => api.post('/api/auth/login', { username, password }),
  guestLogin: () => api.post('/api/auth/guest-login'),
  register: (username, password) => api.post('/api/auth/register', { username, password }),
  logout: () => api.post('/api/auth/logout'),
  getUsers: () => api.get('/api/auth/users'),
  createUser: (data) => api.post('/api/auth/register', data),
  deleteUser: (id) => api.delete(`/api/auth/users/${id}`),
  resumeGuest: (data) => api.post('/api/auth/guest-resume', data),
  getRecentGuests: () => api.get('/api/auth/guest-list-recent'),
};

export default api;
