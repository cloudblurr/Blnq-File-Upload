"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  tier: "guest" | "free" | "pro" | "ultimate";
  storage_used: number;
  bytes_uploaded_total: number;
  subscription_status: string | null;
  plan_expires_at: string | null;
  lifetime_plan: string | null;
}

function normalizeTier(input?: string | null): "guest" | "free" | "pro" | "ultimate" {
  const tier = (input || "free").trim().toLowerCase();
  if (tier === "ultimate") return "ultimate";
  if (tier === "pro" || tier === "core") return "pro";
  if (tier === "guest") return "guest";
  return "free";
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id,tier,storage_used,bytes_uploaded_total,subscription_status,plan_expires_at,lifetime_plan")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      setProfile({ ...(data as Profile), tier: normalizeTier((data as Profile).tier) });
    } else if (error) {
      console.error("Failed to load profile", error.message);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const { data } = await supabase.auth.getUser();
      await loadProfile(data.user?.id);
    }
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = useCallback(async () => {
    await loadProfile(user?.id);
  }, [loadProfile, user?.id]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
