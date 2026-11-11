import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
	supabaseUrl &&
	supabaseAnonKey &&
	supabaseUrl.startsWith('http') &&
	supabaseAnonKey.length > 10
);

/**
 * Singleton Supabase client.
 * Returns null if Supabase environment variables are not configured.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
	? createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
	  })
	: null;

/**
 * Helper to get the currently authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
	if (!supabase) return null;
	try {
		const { data, error } = await supabase.auth.getUser();
		if (error || !data?.user) return null;
		return data.user;
	} catch (err) {
		console.warn('Error fetching Supabase user:', err);
		return null;
	}
}

/**
 * Helper to get the current session.
 */
export async function getCurrentSession(): Promise<Session | null> {
	if (!supabase) return null;
	try {
		const { data, error } = await supabase.auth.getSession();
		if (error) return null;
		return data.session;
	} catch (err) {
		console.warn('Error fetching Supabase session:', err);
		return null;
	}
}

/**
 * Sends a Magic Link sign-in email.
 */
export async function sendMagicLink(email: string, redirectTo?: string) {
	if (!supabase) {
		throw new Error('Supabase no está configurado. Por favor define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
	}
	const redirectUrl = redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined);
	const { data, error } = await supabase.auth.signInWithOtp({
		email,
		options: {
			emailRedirectTo: redirectUrl,
		},
	});
	if (error) throw error;
	return data;
}

/**
 * Signs in with email and password.
 */
export async function signInWithPassword(email: string, password: string) {
	if (!supabase) {
		throw new Error('Supabase no está configurado.');
	}
	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});
	if (error) throw error;
	return data;
}

/**
 * Signs up with email and password.
 */
export async function signUpWithPassword(email: string, password: string) {
	if (!supabase) {
		throw new Error('Supabase no está configurado.');
	}
	const { data, error } = await supabase.auth.signUp({
		email,
		password,
	});
	if (error) throw error;
	return data;
}

/**
 * Signs out from Supabase.
 */
export async function signOutUser() {
	if (!supabase) return;
	const { error } = await supabase.auth.signOut();
	if (error) console.warn('Error signing out:', error);
}

/**
 * Subscribes to auth state changes.
 */
export function onAuthStateChange(callback: (user: User | null, session: Session | null) => void) {
	if (!supabase) {
		callback(null, null);
		return { unsubscribe: () => {} };
	}

	const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
		callback(session?.user || null, session);
	});

	return {
		unsubscribe: () => {
			subscription.unsubscribe();
		},
	};
}
