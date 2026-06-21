"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

// Wallet sign-in via the injected EVM provider (MetaMask / any Web3 wallet).
// No SDK dependency — raw EIP-1193 requests + personal_sign.
export function WalletLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const eth = (typeof window !== "undefined" ? (window as any).ethereum : undefined);
    if (!eth) {
      setError("No Web3 wallet found. Install MetaMask (or any injected wallet) to sign in with your wallet.");
      return;
    }
    setBusy(true);
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("no account selected");

      const n = await fetch("/api/auth/wallet/nonce", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const nj = await n.json();
      if (!n.ok) throw new Error(nj.error ?? "could not start sign-in");

      const signature: string = await eth.request({ method: "personal_sign", params: [nj.message, address] });

      const v = await fetch("/api/auth/wallet/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature, nonce: nj.nonce }),
      });
      const vj = await v.json();
      if (!v.ok) throw new Error(vj.error ?? "verification failed");
      router.push("/account");
    } catch (e: any) {
      // user rejected the signature, or anything else
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button type="button" className="landing-cta" onClick={connect} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
        {busy ? "Check your wallet…" : "⬡ Connect wallet"}
      </button>
      <p className="world-empty" style={{ textAlign: "left", fontSize: 12, opacity: 0.6, margin: 0 }}>
        Sign a message to prove ownership — no gas, no transaction. Your citizens live under your wallet.
      </p>
      {error && <p className="world-error-msg mono">{error}</p>}
    </div>
  );
}
