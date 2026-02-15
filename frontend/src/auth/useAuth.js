// src/auth/useAuth.js
import { useContext } from "react";
import { AuthContext } from "./AuthProvider"; // if you want to export the context directly
import { useAuth as useAuthProvider } from "./AuthProvider";

export const useAuth = () => {
  return useAuthProvider();
};
