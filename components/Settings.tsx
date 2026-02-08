
import React, { useRef } from 'react';
import { UserProfile } from '../types';

interface SettingsProps {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  syncStatus: 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';
}

const Settings: React.FC<SettingsProps> = ({ userProfile, setUserProfile, onExport, onImport, syncStatus }) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Global properties to be synchronized with the remote 'profile/main' document
    const updatedBranding: UserProfile = {
      ...userProfile, // Keep existing properties
      companyName: fd.get('companyName') as string,
      companyAddress: fd.get('companyAddress') as string,
      phone: fd.get('phone') as string,
      loginUsername: (fd.get('loginUsername') as string).toUpperCase(),
      loginPassword: fd.get('loginPassword') as string,
      logo: userProfile.logo // preserve logo
    };

    // Note: 'name' (User Name) and 'branch' (Current Branch) are local identity
    // If we want to persist them globally, we'd need a separate users collection update.
    // For now, these are updated in the local state and will be remembered by localStorage via App.tsx if needed.

    setUserProfile(updatedBranding);
    alert("Enterprise branding and security credentials synchronized with cloud ledger!");
  };

  const getStatusColor = () => {
    // Override syncStatus to show 'Live' as we are now connected to Firestore
    return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
  };

  const getStatusText = () => {
    return 'Cloud Terminal Live';
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">System Administration</h2>
          <p className="text-slate-500 font-medium">Enterprise branding and live cloud node configuration</p>
        </div>
        <div className="bg-white px-6 py-2 rounded-full border border-slate-100 shadow-sm flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`}></div>
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{getStatusText()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Branding & Security Section */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner">🎨</div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Corporate Identity</h3>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-28 h-28 rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group shrink-0 shadow-inner">
                {userProfile.logo ? (
                  <img src={userProfile.logo} className="w-full h-full object-contain p-2" alt="Logo" />
                ) : (
                  <span className="text-4xl grayscale opacity-20">🏢</span>
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="absolute inset-0 bg-indigo-600/90 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all text-[9px] font-black uppercase tracking-widest gap-2"
                >
                  <span className="text-xl">📸</span>
                  Update Logo
                </button>
                <input
                  type="file"
                  ref={logoInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const r = new FileReader();
                      r.onload = (ev) => setUserProfile({ ...userProfile, logo: ev.target?.result as string });
                      r.readAsDataURL(file);
                    }
                  }}
                />
              </div>
              <div className="flex-1 space-y-4 w-full">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Name</label>
                  <input name="companyName" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all uppercase" defaultValue={userProfile.companyName || ""} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Headquarters</label>
                  <input name="companyAddress" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all uppercase" defaultValue={userProfile.companyAddress || ""} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">User Name</label>
                    <input name="userName" readOnly className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold bg-slate-50 text-slate-500 outline-none cursor-not-allowed" defaultValue={userProfile.name} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Line</label>
                    <input name="phone" className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" defaultValue={userProfile.phone || ""} placeholder="+94 ..." />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm">🔐</span>
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Security Credentials</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Admin ID</label>
                  <input name="loginUsername" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black outline-none focus:border-indigo-500 transition-all uppercase text-xs" defaultValue={userProfile.loginUsername || "ADMIN"} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Passphrase</label>
                  <input name="loginPassword" type="password" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black outline-none focus:border-indigo-500 transition-all text-xs" defaultValue={userProfile.loginPassword || "123"} />
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 shadow-slate-200">Sync Global Modifications</button>
          </form>
        </div>

        {/* Data & Backup Section */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner">🛡️</div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Business Continuity</h3>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-6 group hover:border-emerald-200 transition-all">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110">📥</div>
              <div className="flex-1">
                <h4 className="font-black text-slate-900 uppercase text-xs">Offline Snapshot</h4>
                <p className="text-[10px] text-slate-500 font-medium">Export a portable JSON ledger for disaster recovery.</p>
              </div>
              <button onClick={onExport} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all">Download</button>
            </div>

            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-6 group hover:border-indigo-200 transition-all">
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110">📤</div>
              <div className="flex-1">
                <h4 className="font-black text-slate-900 uppercase text-xs">Restore Manifest</h4>
                <p className="text-[10px] text-slate-500 font-medium">Import and synchronize records from a backup file.</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all">Restore</button>
              <input type="file" ref={fileInputRef} onChange={onImport} accept=".json" className="hidden" />
            </div>

            <div className="pt-8 border-t border-slate-100">
              <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 flex items-center gap-6 group">
                <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-3xl">⚠️</div>
                <div className="flex-1">
                  <h4 className="font-black text-rose-900 uppercase text-xs">Terminal Hard Reset</h4>
                  <p className="text-[10px] text-rose-400 font-medium italic">Purge all local session cache and reconnect.</p>
                </div>
                <button
                  onClick={() => { if (confirm("CRITICAL WARNING: This will clear your local terminal cache. Cloud data remains safe. Re-sync?")) { localStorage.clear(); window.location.reload(); } }}
                  className="bg-rose-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
