'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Force a full reload so the server gets the latest auth cookies
    window.location.replace('/admin');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-lg p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold text-center">
          <span className="text-gray-900">Admin</span>{' '}
          <span className="text-blue-600">Login</span>
        </h1>
        <div className="space-y-2">
          <label className="block text-sm">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded py-2 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
