"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Signup failed. Please try again." };
  }

  // Create a placeholder business for the user
  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({
      name: `${name}'s Business`,
      owner_name: name,
      owner_email: email,
    })
    .select("id")
    .single();

  if (bizError) {
    return { error: "Account created but business setup failed: " + bizError.message };
  }

  // Create the user row linked to the business
  const { error: userError } = await supabase.from("users").insert({
    id: authData.user.id,
    business_id: business.id,
    name,
    email,
    role: "owner",
  });

  if (userError) {
    return { error: "Account created but user profile setup failed: " + userError.message };
  }

  redirect("/onboarding");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
