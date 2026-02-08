import React, { useState } from 'react';
import { UserProfile } from '../types';
import { auth, googleProvider, db } from '../services/firebase';
import { signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { collections } from '../services/database';

interface LoginProps {
  onLogin: (profile: UserProfile) => void;
  onSignUp: (profile: UserProfile) => void;
  userProfile: UserProfile;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple Local Logic (Keep this for now as fallback/legacy)
    const normalizedUser = credentials.username.toLowerCase();

    let profileName = "AUTHORIZED USER";
    let branchName = "CASHIER 1"; // Default for salesprasama or admin
    let isAdmin = true;

    if (normalizedUser === 'madupathirana95@gmail.com') {
      if (credentials.password !== 'Madura12') {
        setError("Invalid Password for this user.");
        return;
      }
      profileName = "MADURA PATHIRANA";
      branchName = "CASHIER 2";
    }

    onLogin({
      name: profileName,
      userName: profileName,
      companyName: "PRASAMA(PVT)LTD", // Explicitly set company name
      companyAddress: "No 16, Kirulapana Supermarket, Colombo 05",
      branch: branchName,
      allBranches: (branchName === "CASHIER 2") ? ["CASHIER 2"] : ["CASHIER 1", "CASHIER 2"],
      loginUsername: credentials.username,
      isAdmin: isAdmin
    });
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setPendingApproval(false);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = user.email?.toLowerCase();

      if (!email) {
        throw new Error("No email provided by Google.");
      }

      // Check if user exists in our DB
      const userRef = doc(db, collections.users, user.uid);
      const userSnap = await getDoc(userRef);

      const isAdminEmail = email === 'salesprasama@gmail.com';

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.approved || isAdminEmail) {
          // Success Login
          let branch = userData.branch || "Head Office";
          if (email === 'madupathirana95@gmail.com') {
            branch = 'CASHIER 2';
          }

          onLogin({
            name: userData.name || user.displayName || "USER",
            userName: userData.name || user.displayName || "USER",
            branch: branch,
            loginUsername: email,
            isAdmin: userData.isAdmin || isAdminEmail,
            email: email
          });
        } else {
          setPendingApproval(true);
        }
      } else {
        // Create new user
        let branch = "Head Office";
        if (email === 'madupathirana95@gmail.com') {
          branch = 'CASHIER 2';
        }

        const newUserData = {
          email: email,
          name: user.displayName || "New User",
          photoURL: user.photoURL,
          approved: isAdminEmail, // Auto-approve admin
          isAdmin: isAdminEmail,
          role: isAdminEmail ? 'ADMIN' : 'USER',
          createdAt: new Date().toISOString(),
          branch
        };

        await setDoc(userRef, newUserData);

        if (isAdminEmail || email === 'madupathirana95@gmail.com') {
          // Auto-login specific users if acceptable, or just rely on the approved check
          // For madupathirana, we might want to auto-approve? 
          // The logic above says "if (userData.approved || isAdminEmail)". 
          // If new user, they are NOT approved by default unless admin.
          // Let's assume madupathirana needs approval, OR we treat them as pre-approved?
          // For now, I will just set the branch in newUserData. 
          // But if they are NOT approved, they can't login yet. 
          // Assuming they are already approved/existing in DB, the top block handles it.
          // If they are NEW, they will fall to Pending Approval.

          // If the user implies they ARE using the app, they must be approved.

          if (isAdminEmail) {
            onLogin({
              name: newUserData.name,
              userName: newUserData.name,
              branch: "Head Office",
              loginUsername: email,
              isAdmin: true,
              email: email
            });
          } else {
            setPendingApproval(true);
          }
        } else {
          setPendingApproval(true);
        }
      }

    } catch (err: any) {
      console.error(err);
      let msg = "Failed to sign in with Google.";

      // Parse Firebase Error Codes for user-friendly messages
      if (err.code === 'auth/configuration-not-found') {
        msg = "Setup Required: Google Sign-In is disabled.";
        setError(msg);
        // We can handle the link in the UI render part ideally, but keeping it simple here for now
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = "Domain not authorized. Please use the Purple 'Unlock Terminal' button below for immediate access.";
        setError(msg);
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = "Sign-in was cancelled.";
        setError(msg);
      } else {
        msg = err.message;
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0f172a] relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full"></div>

      <div className="w-full max-w-sm p-6 relative z-10 transition-all duration-500">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-[0_0_40px_rgba(79,70,229,0.3)] mx-auto mb-4">
            <span className="font-black text-2xl italic">P</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">PRASAMA LOCAL</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Secure Offline Enterprise Suite</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
          {pendingApproval ? (
            <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto text-3xl">
                ⏳
              </div>
              <h3 className="text-white font-black text-lg uppercase">Approval Pending</h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Your account has been created but requires administrator approval to access the system.
              </p>
              <a href={`mailto:salesprasama@gmail.com?subject=New User Approval Request&body=Please approve user access for.`} className="block w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
                Request Access via Email
              </a>
              <button onClick={() => setPendingApproval(false)} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mt-4">
                Back to Login
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-4 mb-6">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
                  <input
                    required
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-indigo-500 transition-all text-sm"
                    placeholder="username"
                    value={credentials.username}
                    onChange={e => setCredentials({ ...credentials, username: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-indigo-500 transition-all text-sm"
                    placeholder="••••••••"
                    value={credentials.password}
                    onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                  />
                </div>

                {error && (
                  <div className="text-center space-y-2">
                    <p className="text-rose-500 text-[9px] font-black uppercase">{error}</p>
                    {error.includes("Setup Required") && (
                      <a
                        href="https://console.firebase.google.com/project/prasama-72c8d/authentication/providers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 text-[9px] font-bold underline hover:text-indigo-300"
                      >
                        👉 Click here to Enable Google Provider
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all"
                >
                  Unlock Terminal
                </button>
              </form>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-slate-500 text-[9px] font-black uppercase tracking-widest">Or access via</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full mt-4 bg-white hover:bg-slate-50 text-slate-900 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.1em] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="animate-pulse">Connecting...</span>
                ) : (
                  <>
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
                    Sign in with Google
                  </>
                )}
              </button>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-white/5 text-center">
            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2">
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
