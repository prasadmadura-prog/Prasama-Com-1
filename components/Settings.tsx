
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
    setUserProfile(prev => ({
      ...prev,
      name: fd.get('name') as string,
      branch: fd.get('branch') as string,
      loginUsername: (fd.get('loginUsername') as string).toUpperCase(),
      loginPassword: fd.get('loginPassword') as string,
    }));
    alert("System administration and security records updated successfully!");
  };

  const getStatusColor = () => {
    switch(syncStatus) {
      case 'IDLE': return 'bg-emerald-500';
      case 'SYNCING': return 'bg-amber-400 animate-pulse';
      case 'OFFLINE': return 'bg-slate-400';
      case 'ERROR': return 'bg-rose-500';
      default: return 'bg-slate-300';
    }
  };

  const getStatusText = () => {
    switch(syncStatus) {
      case 'IDLE': return 'Cloud Synchronized';
      case 'SYNCING': return 'Syncing State...';
      case 'OFFLINE': return 'Local Mode Only';
      case 'ERROR': return 'Connection Warning';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">System Administration</h2>
        <p className="text-slate-500 font-medium">Enterprise branding and data disaster recovery</p>
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
              <div className="w-28 h-28 rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group shrink-0">
                {userProfile.logo ? (
                  <img src={userProfile.logo} className="w-full h-full object-contain p-2" alt="Logo" />
                ) : (
                  <span className="text-4xl">🏢</span>
                )}
                <button 
                  type="button" 
                  onClick={() => logoInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] font-black uppercase tracking-widest"
                >
                  Change
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
                      r.onload = (ev) => setUserProfile(prev => ({ ...prev, logo: ev.target?.result as string }));
                      r.readAsDataURL(file);
                    }
                  }}
                />
              </div>
              <div className="flex-1 space-y-4 w-full">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Full Company Name</label>
                   <input name="name" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-all" defaultValue={userProfile.name} />
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">HQ / Branch Address</label>
                   <input name="branch" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none focus:border-indigo-500 transition-all" defaultValue={userProfile.branch} />
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
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Admin Username</label>
                   <input name="loginUsername" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black outline-none focus:border-indigo-500 transition-all uppercase text-xs" defaultValue={userProfile.loginUsername || "ADMIN"} />
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Admin Password</label>
                   <input name="loginPassword" type="password" required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black outline-none focus:border-indigo-500 transition-all text-xs" defaultValue={userProfile.loginPassword || "123"} />
                 </div>
               </div>
            </div>

            <button type="submit" className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95">Commit Global Modifications</button>
          </form>
        </div>

        {/* Data & Backup Section */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner">🛡️</div>
               <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Backup & Recovery</h3>
            </div>
            <div className="flex flex-col items-end gap-1">
               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Connectivity</span>
               <div className="flex items-center gap-2">
                 <span className="text-[9px] font-bold text-slate-500">{getStatusText()}</span>
                 <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`}></div>
               </div>
            </div>
          </div>

          <div className="space-y-4">
             {syncStatus === 'OFFLINE' && (
               <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                 <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">
                   ⚠️ Local-First Storage Active. System is currently relying on Local Browser Persistence. Ensure periodic manual backups are performed.
                 </p>
               </div>
             )}

             <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-6 group hover:border-emerald-200 transition-all">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110">📥</div>
                <div className="flex-1">
                   <h4 className="font-black text-slate-900 uppercase text-xs">Download Full Backup</h4>
                   <p className="text-[10px] text-slate-500 font-medium">Export all ledger assets, transactions, and settings to a JSON file.</p>
                </div>
                <button onClick={onExport} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all">Download</button>
             </div>

             <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-6 group hover:border-indigo-200 transition-all">
                <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110">📤</div>
                <div className="flex-1">
                   <h4 className="font-black text-slate-900 uppercase text-xs">Upload / Restore Session</h4>
                   <p className="text-[10px] text-slate-500 font-medium">Import business records from a previous backup file.</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all">Restore</button>
                <input type="file" ref={fileInputRef} onChange={onImport} accept=".json" className="hidden" />
             </div>

             <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 flex items-center gap-6 group">
                <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-3xl">⚠️</div>
                <div className="flex-1">
                   <h4 className="font-black text-rose-900 uppercase text-xs">Hard System Reset</h4>
                   <p className="text-[10px] text-rose-400 font-medium">Wipe all data and reset to factory defaults. Cannot be undone.</p>
                </div>
                <button 
                  onClick={() => { if(confirm("CRITICAL WARNING: This will permanently delete ALL enterprise records. Proceed?")) { localStorage.clear(); window.location.reload(); } }}
                  className="bg-rose-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all"
                >
                  Reset
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
