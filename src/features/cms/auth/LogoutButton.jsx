"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authRequest } from "./client";

const LogoutButton = () => {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const logout = async () => {
    try { await authRequest("/sign-out", {}); router.replace("/admin/login"); router.refresh(); }
    catch (error) { setMessage(error.message); }
  };
  return <><button className="button button-red" onClick={logout}>Keluar</button><p role="status">{message}</p></>;
};
export default LogoutButton;
