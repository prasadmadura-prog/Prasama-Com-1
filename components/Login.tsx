
import React, { useState } from 'react';
import { UserProfile } from '../types';

interface LoginProps {
  onLogin: (profile: UserProfile) => void;
  onSignUp: (profile: UserProfile) => void;
  userProfile: UserProfile;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple Local Logic
    const isAdmin = credentials.username.toLowerCase() === 'admin';
    
    onLogin({
      name: credentials.username.toUpperCase() || "AUTHORIZED USER",
      branch: "Local Node",
      loginUsername: credentials.username,
      isAdmin: isAdmin
    });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0f172a] relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full"></div>
      
      <div className="w-full max-w-lg p-8 relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-[0_0_40px_rgba(79,70,229,0.3)] mx-auto mb-6">
            <span className="font-black text-3xl italic">P</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">PRASAMA LOCAL</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Secure Offline Enterprise Suite</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
              <input 
                required
                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:border-indigo-500 transition-all uppercase"
                placeholder="ADMIN"
                value={credentials.username}
                onChange={e => setCredentials({...credentials, username: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <input 
                type="password" 
                required
                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:border-indigo-500 transition-all"
                placeholder="••••••••"
                value={credentials.password}
                onChange={e => setCredentials({...credentials, password: e.target.value})}
              />
            </div>

            {error && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{error}</p>}

            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all"
            >
              Unlock Terminal
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/5 text-center">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Local Database Ready
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
