import { supabase } from '../lib/supabaseClient'

/**
 * Submits the public Contact Us form. Works whether or not the visitor is
 * signed in (contact_messages allows anonymous inserts) — user_id is
 * attached only when a session exists, purely for context.
 */
export async function submitContactMessage({ name, email, subject, message }) {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('contact_messages').insert({
    user_id: auth?.user?.id ?? null,
    name,
    email,
    subject,
    message,
  })
  if (error) throw error
}
