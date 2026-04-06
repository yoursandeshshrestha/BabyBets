import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

class AuthService {
  private isChecking = false

  async checkAuth(): Promise<void> {
    if (this.isChecking) {
      return
    }

    const { isInitialized } = useAuthStore.getState()

    if (isInitialized) {
      return
    }

    try {
      this.isChecking = true
      useAuthStore.getState().setLoading(true)

      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Auth check error:', error)
        useAuthStore.getState().setUser(null)
      } else if (session?.user) {
        const userRole = session.user.user_metadata?.role

        const user = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
          avatar: session.user.user_metadata?.avatar_url || null,
          googleId: session.user.user_metadata?.sub || '',
          isAdmin: userRole === 'admin' || userRole === 'super_admin',
          isInfluencer: userRole === 'influencer',
          createdAt: session.user.created_at,
          updatedAt: session.user.updated_at || session.user.created_at,
        }

        useAuthStore.getState().setUser(user)
      } else {
        useAuthStore.getState().setUser(null)
      }
    } catch (error) {
      console.error('Auth check error:', error)
      useAuthStore.getState().setUser(null)
    } finally {
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setInitialized(true)
      this.isChecking = false
    }
  }

  async refreshAuth(): Promise<void> {
    try {
      useAuthStore.getState().setLoading(true)

      // Use refreshSession() to fetch a new JWT with updated metadata from server
      const { data: { session }, error } = await supabase.auth.refreshSession()

      if (error) {
        console.error('Auth refresh error:', error)
        useAuthStore.getState().setUser(null)
      } else if (session?.user) {
        const userRole = session.user.user_metadata?.role

        const user = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
          avatar: session.user.user_metadata?.avatar_url || null,
          googleId: session.user.user_metadata?.sub || '',
          isAdmin: userRole === 'admin' || userRole === 'super_admin',
          isInfluencer: userRole === 'influencer',
          createdAt: session.user.created_at,
          updatedAt: session.user.updated_at || session.user.created_at,
        }

        useAuthStore.getState().setUser(user)
      } else {
        useAuthStore.getState().setUser(null)
      }
    } catch (error) {
      console.error('Auth refresh error:', error)
      useAuthStore.getState().setUser(null)
    } finally {
      useAuthStore.getState().setLoading(false)
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      })

      if (error) {
        console.error('Google sign-in error:', error)
        throw error
      }
    } catch (error) {
      console.error('Sign-in error:', error)
      throw error
    }
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Email sign-in error:', error)
        throw error
      }

      if (data.session?.user) {
        await this.refreshAuth()
      }
    } catch (error) {
      console.error('Sign-in error:', error)
      throw error
    }
  }

  async signUpWithEmail(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<{ requiresEmailConfirmation: boolean }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: firstName && lastName ? `${firstName} ${lastName}` : firstName || email.split('@')[0],
          },
          emailRedirectTo: `${window.location.origin}/auth/verify-email`,
        },
      })

      if (error) {
        console.error('Email sign-up error:', error)
        throw error
      }

      // Check if email confirmation is required
      // If there's a session immediately, confirmation is disabled
      // If there's no session, confirmation is required
      const requiresEmailConfirmation = !data.session

      if (data.session?.user) {
        await this.refreshAuth()

        // Welcome email will be sent automatically by database trigger on profiles INSERT
      }

      return { requiresEmailConfirmation }
    } catch (error) {
      console.error('Sign-up error:', error)
      throw error
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      // Generate reset token and send email via Supabase
      // NOTE: Customize the email template in Supabase Dashboard > Authentication > Email Templates
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        console.error('Password reset error:', error)
        throw error
      }
    } catch (error) {
      console.error('Password reset error:', error)
      throw error
    }
  }

  async updatePassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        console.error('Password update error:', error)
        throw error
      }
    } catch (error) {
      console.error('Password update error:', error)
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut()
      useAuthStore.getState().signOut()
    } catch (error) {
      console.error('Logout error:', error)
      useAuthStore.getState().signOut()
    }
  }
}

export const authService = new AuthService()
