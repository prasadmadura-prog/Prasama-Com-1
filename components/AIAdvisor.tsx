
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Transaction, Product, Vendor, UserProfile, BankAccount } from '../types';

interface AIAdvisorProps {
  transactions: Transaction[];
  products: Product[];
  vendors: Vendor[];
  accounts: BankAccount[];
  userProfile: UserProfile;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ transactions, products, vendors, accounts, userProfile }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: `Greetings. I am your Strategic AI Advisor for ${userProfile.name}. I have analyzed your current ledger and inventory. How can I assist with your business intelligence today?` }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setIsTyping(true);

    try {
      // Best practice: Use GoogleGenAI without explicit apiKey to automatically use GEMINI_API_KEY env variable
      const ai = new GoogleGenAI({});
      
      // Constructing detailed business context for analysis
      const businessContext = {
        company: userProfile.name,
        branch: userProfile.branch,
        liquidity: accounts.map(a => ({ name: a.name, balance: a.balance })),
        inventoryStatus: products.map(p => ({ name: p.name, stock: p.stock, threshold: p.lowStockThreshold })),
        recentPerformance: transactions.slice(0, 10).map(t => ({ type: t.type, amount: t.amount, date: t.date })),
        vendorDebt: vendors.map(v => ({ name: v.name, balance: v.totalBalance }))
      };

      // Use systemInstruction in config to guide the model's behavior
      const result = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: currentInput,
        config: {
          systemInstruction: `You are a senior business intelligence consultant for ${userProfile.name}. Provide professional, data-driven strategic advice based on this context: ${JSON.stringify(businessContext)}. Be concise and actionable.`,
        }
      });

      let fullText = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of result) {
        // Access .text as a property and handle potential undefined
        const textChunk = chunk.text || '';
        fullText += textChunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].text = fullText;
          return newMsgs;
        });
      }
    } catch (error) {
      console.error("Gemini SDK Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "I apologize, but I encountered an error accessing the intelligence core. Please check your connectivity or try again later." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in duration-700">
      <div className="bg-slate-900 rounded-[2.5rem] flex-1 flex flex-col shadow-2xl border border-slate-800 overflow-hidden relative">
        {/* Header */}
        <div className="px-10 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-600/20">✨</div>
             <div>
                <h2 className="text-white font-black uppercase text-sm tracking-tighter">Strategic Intelligence Terminal</h2>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Gemini 3 Pro Core Active</span>
                </div>
             </div>
          </div>
          <div className="text-right">
             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Authorized Branch</p>
             <p className="text-[10px] font-bold text-indigo-400">{userProfile.branch}</p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar relative">
          {/* Background decoration */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none"></div>
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
              <div className={`max-w-[80%] px-8 py-6 rounded-[2rem] text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white font-semibold rounded-tr-lg shadow-xl shadow-indigo-600/10' 
                  : 'bg-slate-800/50 text-slate-200 border border-slate-700/50 rounded-tl-lg backdrop-blur-sm shadow-sm'
              }`}>
                {msg.text || (isTyping && i === messages.length - 1 ? <div className="flex gap-1 py-1"><div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-.3s]"></div><div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-.5s]"></div></div> : '')}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Input Area */}
        <div className="p-8 bg-slate-900 border-t border-slate-800">
           <div className="max-w-4xl mx-auto flex gap-4">
              <input 
                type="text" 
                className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-8 py-4 text-white font-bold text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-600"
                placeholder="Ask about inventory trends, cash flow analysis, or vendor optimization..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-20"
              >
                Consult AI
              </button>
           </div>
           <p className="text-center text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-4">AI may display inaccuracies; verify critical business decisions with ledger audits.</p>
        </div>
      </div>
    </div>
  );
};

export default AIAdvisor;
