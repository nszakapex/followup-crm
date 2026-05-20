"use client";

import { createContext, useContext } from "react";
import type { User, Business } from "@/types/database";

export interface AuthContext {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContext>({
  user: null,
  business: null,
  isLoading: true,
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
