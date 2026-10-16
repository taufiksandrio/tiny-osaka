"use client";
import { useSyncExternalStore } from "react";

const subscribe = callback => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
const snapshot = () => window.location.hash;
const serverSnapshot = () => "";
export const useAuthToken = () => {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const token = new URLSearchParams(hash.slice(1)).get("token");
  return token && token.length <= 4096 ? token : null;
};
