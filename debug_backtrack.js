import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDgTA61l64jv4fR0SusbRYKx4GfhxoIZ90",
    authDomain: "prasama-72c8d.firebaseapp.com",
    projectId: "prasama-72c8d",
    storageBucket: "prasama-72c8d.firebasestorage.app",
    messagingSenderId: "294615686061",
    appId: "1:294615686061:web:8c8906fc36f8f93edf9f24"
};

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Fetching accounts...");
  const accountsSnap = await getDocs(collection(db, "accounts"));
  const accounts = [];
  accountsSnap.forEach(doc => {
    accounts.push({ id: doc.id, ...doc.data() });
  });

  console.log("Fetching transactions...");
  const txSnap = await getDocs(collection(db, "transactions"));
  const transactions = [];
  txSnap.forEach(doc => {
    transactions.push({ id: doc.id, ...doc.data() });
  });

  console.log(`Loaded ${accounts.length} accounts and ${transactions.length} transactions.`);
  console.log("Current accounts balances:");
  accounts.forEach(acc => {
    console.log(` - Account ${acc.id} (${acc.name}): Balance = ${acc.balance}`);
  });

  const endDay = "2026-03-31";
  console.log(`\nSimulating backtrack to ${endDay}...`);

  const accountBalances = {};
  accounts.forEach(acc => {
    accountBalances[acc.id] = Number(acc.balance || 0);
  });

  const txsAfterEndDay = transactions.filter(t => {
    const txDate = t.date.split('T')[0];
    return txDate > endDay;
  });

  console.log(`Found ${txsAfterEndDay.length} transactions after ${endDay}.`);

  txsAfterEndDay.sort((a, b) => a.date.localeCompare(b.date));

  txsAfterEndDay.forEach(t => {
    const txDate = t.date.split('T')[0];
    const amt = Number(t.amount || 0);
    const isOutflow = t.type === 'EXPENSE' || t.type === 'TRANSFER' || t.type === 'PURCHASE';
    
    const prevBal = { ...accountBalances };

    if (t.accountId) {
      if (isOutflow) {
        accountBalances[t.accountId] = (accountBalances[t.accountId] || 0) + amt;
      } else {
        accountBalances[t.accountId] = (accountBalances[t.accountId] || 0) - amt;
      }
    }
    if (t.type === 'TRANSFER' && t.destinationAccountId) {
      accountBalances[t.destinationAccountId] = (accountBalances[t.destinationAccountId] || 0) - amt;
    }

    // If change is significant, print it
    if (amt > 10000 || t.type === 'CREDIT_PAYMENT') {
      console.log(`[${t.date}] Type: ${t.type}, Amt: ${amt}, Method: ${t.paymentMethod}, AccountId: ${t.accountId}, DestAccountId: ${t.destinationAccountId}`);
      console.log(`   - Backtrack effect:`);
      if (t.accountId) {
        console.log(`     Account ${t.accountId} changed: ${prevBal[t.accountId]} -> ${accountBalances[t.accountId]} (Diff: ${accountBalances[t.accountId] - prevBal[t.accountId]})`);
      }
      if (t.type === 'TRANSFER' && t.destinationAccountId) {
        console.log(`     Dest Account ${t.destinationAccountId} changed: ${prevBal[t.destinationAccountId]} -> ${accountBalances[t.destinationAccountId]} (Diff: ${accountBalances[t.destinationAccountId] - prevBal[t.destinationAccountId]})`);
      }
    }
  });

  console.log("\nFinal backtracked account balances at 2026-03-31:");
  let sum = 0;
  Object.keys(accountBalances).forEach(accId => {
    console.log(` - Account ${accId}: Balance = ${accountBalances[accId]}`);
    sum += accountBalances[accId];
  });
  console.log(`Total Cash & Bank Backtracked Sum: ${sum}`);
}

run().catch(console.error);
