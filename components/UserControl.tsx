
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { upsertDocument, deleteDocument, subscribeToCollection, collections as dbCols } from '../services/database';

interface UserControlProps {
  userProfile: UserProfile;
}

const UserControl: React.FC<UserControlProps> = ({ userProfile }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [branch, setBranch] = useState('CASHIER 1');
  const [isAdmin, setIsAdmin] = useState(false);
  const [allBranches, setAllBranches] = useState<string[]>(['CASHIER 1', 'CASHIER 2', 'CASHIER 3']);

  useEffect(() => {
    const unsub = subscribeToCollection(dbCols.users, (data) => setUsers(data as UserProfile[]));
    return () => unsub();
  }, []);

  const openModal = (user?: UserProfile) => {
    if (user) {
      setEditingUser(user);
      setName(user.name);
      setEmail(user.email || '');
      setLoginUsername(user.loginUsername || '');
      setLoginPassword(user.loginPassword || '');
      setBranch(user.branch);
      setIsAdmin(user.isAdmin || false);
      setAllBranches(user.allBranches || ['CASHIER 1', 'CASHIER 2', 'CASHIER 3']);
    } else {
      setEditingUser(null);
      setName('');
      setEmail('');
      setLoginUsername('');
      setLoginPassword('');
      setBranch('CASHIER 1');
      setIsAdmin(false);
      setAllBranches(['CASHIER 1', 'CASHIER 2', 'CASHIER 3']);
    }
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !loginUsername || !loginPassword) {
      alert("Name, Username, and Password are required.");
      return;
    }

    const userId = editingUser?.email || editingUser?.loginUsername || loginUsername;
    const userData: UserProfile = {
      name,
      email,
      loginUsername,
      loginPassword,
      branch,
      isAdmin,
      allBranches
    };

    await upsertDocument(dbCols.users, userId, userData);
    setIsModalOpen(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm("Are you sure you want to remove this user access?")) {
      await deleteDocument(dbCols.users, userId);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">User Control Panel</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Access Control & Staff Management</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95"
        >
          + Add New User
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px] flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-8 py-5">Full Name</th>
                <th className="px-8 py-5">Login ID / Email</th>
                <th className="px-8 py-5">Assigned Branch</th>
                <th className="px-8 py-5">Role</th>
                <th className="px-8 py-5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {users.map((u, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/20 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-slate-900 font-black uppercase text-xs">{u.name}</p>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-slate-500 font-bold text-xs">{u.loginUsername || u.email}</p>
                  </td>
                  <td className="px-8 py-5">
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                      {u.branch}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${u.isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {u.isAdmin ? 'Super Admin' : 'Standard User'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center justify-center gap-2">
                       <button 
                        onClick={() => openModal(u)}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-white hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                       >
                         ✏️
                       </button>
                       <button 
                        onClick={() => handleDeleteUser(u.loginUsername || u.email || '')}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-white hover:border-rose-500 hover:text-rose-600 transition-all shadow-sm"
                       >
                         🗑️
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-32 text-center">
                    <div className="text-4xl mb-4 grayscale opacity-20">🛡️</div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] italic">No registered users found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">User Registration</h3>
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">Access Configuration</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSaveUser} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Staff Name</label>
                  <input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value.toUpperCase())} 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-all uppercase" 
                    placeholder="ENTER FULL NAME"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email (Optional)</label>
                  <input 
                    type="email"
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-all" 
                    placeholder="EMAIL ADDRESS"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Login Username</label>
                  <input 
                    required 
                    value={loginUsername} 
                    onChange={e => setLoginUsername(e.target.value)} 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-all" 
                    placeholder="USERNAME"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Login Password</label>
                  <input 
                    required 
                    type="password"
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-all" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Branch</label>
                  <select 
                    value={branch} 
                    onChange={e => setBranch(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-all uppercase"
                  >
                    <option value="CASHIER 1">CASHIER 1 (Master)</option>
                    <option value="CASHIER 2">CASHIER 2</option>
                    <option value="CASHIER 3">CASHIER 3</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">User Role / Privilege</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsAdmin(false)}
                      className={`flex-1 py-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all ${!isAdmin ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border-slate-200 text-slate-400'}`}
                    >
                      Staff
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsAdmin(true)}
                      className={`flex-1 py-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all ${isAdmin ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border-slate-200 text-slate-400'}`}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserControl;
