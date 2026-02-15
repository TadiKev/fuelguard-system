// src/pages/Register.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Register() {
  const { register } = useAuth();
  const [payload, setPayload] = useState({ username: "", email: "", password: "" });
  const [err, setErr] = useState(null);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await register(payload);
      navigate("/login");
    } catch (e) {
      setErr(e?.response?.data || e.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl mb-4">Register</h2>
        {err && <div className="text-red-600 mb-2">{JSON.stringify(err)}</div>}
        <label className="block mb-2">
          <span className="text-sm">Username</span>
          <input value={payload.username} onChange={(e) => setPayload({ ...payload, username: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
        </label>
        <label className="block mb-2">
          <span className="text-sm">Email</span>
          <input value={payload.email} onChange={(e) => setPayload({ ...payload, email: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
        </label>
        <label className="block mb-4">
          <span className="text-sm">Password</span>
          <input type="password" value={payload.password} onChange={(e) => setPayload({ ...payload, password: e.target.value })} className="mt-1 block w-full border rounded px-3 py-2" />
        </label>
        <button className="w-full py-2 rounded bg-green-600 text-white">Create account</button>
      </form>
    </div>
  );
}
