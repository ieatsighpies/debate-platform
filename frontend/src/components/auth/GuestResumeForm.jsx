import React, { useState, useEffect } from 'react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

const GuestResumeForm = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [recentGuests, setRecentGuests] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Fetch recent guests on mount
  useEffect(() => {
    fetchRecentGuests();
  }, []);

  const fetchRecentGuests = async () => {
    try {
      const response = await authAPI.getRecentGuests();
      setRecentGuests(response.data.guests);
    } catch (error) {
      console.error('Failed to fetch recent guests:', error);
    }
  };

  // ✅ Filter guests based on input
  const filteredGuests = recentGuests.filter(guest =>
    guest.username.toLowerCase().includes(username.toLowerCase())
  );

  const handleResume = async (e) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error('Please enter or select your guest username');
      return;
    }

    try {
      setLoading(true);
      const response = await authAPI.resumeGuest({ username: username.trim() });

      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('guestUsername', username.trim());

      toast.success('Session resumed!');
      onSuccess(response.data);

    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('Guest session not found. Check your username or start a new session.');
      } else {
        toast.error('Failed to resume session');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectGuest = (guestUsername) => {
    setUsername(guestUsername);
    setShowDropdown(false);
  };

  const formatLastSeen = (lastLogin) => {
    const now = new Date();
    const loginDate = new Date(lastLogin);
    const diffMs = now - loginDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <form onSubmit={handleResume} className="space-y-4">
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Resume Guest Session
        </label>

        {/* ✅ Input with autocomplete */}
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Start typing or select your username..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          disabled={loading}
          autoComplete="off"
        />

        {/* ✅ Dropdown with filtered results */}
        {showDropdown && filteredGuests.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredGuests.map((guest, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectGuest(guest.username)}
                className="w-full px-4 py-3 text-left hover:bg-indigo-50 transition flex justify-between items-center border-b last:border-b-0"
              >
                <span className="font-medium text-gray-800">
                  {guest.username}
                </span>
                <span className="text-xs text-gray-500">
                  {formatLastSeen(guest.lastSeen)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ✅ Show message if no matches */}
        {showDropdown && username && filteredGuests.length === 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
            <p className="text-sm text-gray-500 text-center">
              No matching guests found
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-2">
          Select from recent guests or type your username manually
        </p>
      </div>

      {/* ✅ Close dropdown when clicking outside */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowDropdown(false)}
        />
      )}

      <button
        type="submit"
        disabled={loading || !username.trim()}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {loading ? 'Resuming...' : 'Resume Session'}
      </button>
    </form>
  );
};

export default GuestResumeForm;