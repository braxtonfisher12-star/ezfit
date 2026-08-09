import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

// Loads the signed-in user's profile + current nutrition targets, and exposes
// a save function used by onboarding and Settings.
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("nutrition_targets")
        .select("*")
        .eq("user_id", user.id)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setProfile(p);
    setTargets(t);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async (fields) => {
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...fields })
      .select()
      .single();
    if (!error) setProfile(data);
    return { data, error };
  };

  const saveTargets = async (fields) => {
    const { data, error } = await supabase
      .from("nutrition_targets")
      .insert({ user_id: user.id, ...fields })
      .select()
      .single();
    if (!error) setTargets(data);
    return { data, error };
  };

  return { profile, targets, loading, saveProfile, saveTargets, reload: load };
}
