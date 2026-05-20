"use client";

import { useEffect, useState } from "react";
import { AuthContext, type AuthContext as AuthContextType } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import type { User, Business } from "@/types/database";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextType>({
    user: null,
    business: null,
    isLoading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setState({ user: null, business: null, isLoading: false });
        return;
      }

      // Load user profile
      const { data: userProfile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (!userProfile) {
        setState({ user: null, business: null, isLoading: false });
        return;
      }

      // Load business
      const { data: business } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", userProfile.business_id)
        .single();

      setState({
        user: userProfile as User,
        business: business as Business | null,
        isLoading: false,
      });
    }

    loadUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({ user: null, business: null, isLoading: false });
      } else {
        loadUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}
