import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { authService } from '@/services/auth.service'
import { showErrorToast, showSuccessToast } from '@/lib/toast'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password || !confirmPassword) {
      showErrorToast('Please enter your new password')
      return
    }

    if (password.length < 12) {
      showErrorToast('Password must be at least 12 characters for security')
      return
    }

    if (password !== confirmPassword) {
      showErrorToast('Passwords do not match')
      return
    }

    try {
      setLoading(true)
      await authService.updatePassword(password)
      setSuccess(true)
      showSuccessToast('Password updated successfully!')

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)
    } catch (error) {
      console.error('Password reset failed:', error)
      showErrorToast('Failed to reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="antialiased relative min-h-screen overflow-hidden" style={{ color: '#151e20', backgroundColor: '#fffbf7' }}>
        {/* Background decorative elements */}
        <div
          className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] rounded-full blur-3xl -z-10"
          style={{ backgroundColor: 'rgba(254, 208, 185, 0.3)' }}
        />
        <div
          className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] rounded-full blur-3xl -z-10"
          style={{ backgroundColor: 'rgba(225, 234, 236, 0.3)' }}
        />

        <div className="flex h-screen items-center justify-center px-4 sm:px-6">
          <div
            className="w-full max-w-md rounded-2xl p-8 sm:p-10 text-center border-0 lg:border-2"
            style={{
              backgroundColor: '#fffbf7',
              borderColor: '#e7e5e4'
            }}
          >
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
            >
              <svg className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: '#22c55e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3"
              style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
            >
              Password Updated!
            </h2>
            <p className="text-sm sm:text-base" style={{ color: '#78716c' }}>
              Your password has been successfully updated. Redirecting you to the login page...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="antialiased relative min-h-screen overflow-hidden" style={{ color: '#151e20', backgroundColor: '#fffbf7' }}>
      {/* Background decorative elements */}
      <div
        className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] rounded-full blur-3xl -z-10"
        style={{ backgroundColor: 'rgba(254, 208, 185, 0.3)' }}
      />
      <div
        className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] rounded-full blur-3xl -z-10"
        style={{ backgroundColor: 'rgba(225, 234, 236, 0.3)' }}
      />

      {/* Back button */}
      <div className="fixed top-4 left-4 sm:top-6 sm:left-6 z-50">
        <button
          onClick={() => navigate('/login')}
          className="p-2 sm:p-2.5 rounded-xl hover:bg-white/80 flex items-center justify-center transition-all cursor-pointer"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', color: '#151e20', backdropFilter: 'blur(8px)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
          }}
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex h-screen items-center justify-center px-4 sm:px-6">
        <div
          className="w-full max-w-md rounded-2xl p-6 sm:p-8 md:p-10 border-0 lg:border-2"
          style={{
            backgroundColor: '#fffbf7',
            borderColor: '#e7e5e4'
          }}
        >
          {/* Header */}
          <div className="mb-6 sm:mb-8 text-center">
            <div className="flex items-center justify-center mb-4 sm:mb-6">
              <img
                src="/babybets-logo.png"
                alt="BabyBets Logo"
                className="h-10 sm:h-12"
              />
            </div>
            <h1
              className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3"
              style={{ fontFamily: "'Fraunces', serif", color: '#151e20' }}
            >
              Reset your password
            </h1>
            <p className="text-sm sm:text-base" style={{ color: '#78716c' }}>
              Enter your new password below
            </p>
          </div>

          {/* Reset Password form */}
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-bold mb-2" style={{ color: '#151e20' }}>
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-base transition-all cursor-pointer"
                  style={{
                    borderWidth: '2px',
                    borderColor: '#e7e5e4',
                    backgroundColor: '#fffbf7',
                    color: '#151e20'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#496B71'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(73, 107, 113, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e7e5e4'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: '#78716c' }}
                  tabIndex={-1}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#151e20'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#78716c'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-bold mb-2" style={{ color: '#151e20' }}>
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-base transition-all cursor-pointer"
                  style={{
                    borderWidth: '2px',
                    borderColor: '#e7e5e4',
                    backgroundColor: '#fffbf7',
                    color: '#151e20'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#496B71'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(73, 107, 113, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e7e5e4'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: '#78716c' }}
                  tabIndex={-1}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#151e20'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#78716c'}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full px-6 py-3 sm:py-4 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer flex items-center justify-center gap-2"
              style={{
                backgroundColor: !password || !confirmPassword ? '#d1d5db' : '#496B71',
                color: 'white',
                cursor: !password || !confirmPassword || loading ? 'not-allowed' : 'pointer',
                opacity: !password || !confirmPassword ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (password && confirmPassword && !loading) {
                  e.currentTarget.style.backgroundColor = '#3a565a'
                }
              }}
              onMouseLeave={(e) => {
                if (password && confirmPassword) {
                  e.currentTarget.style.backgroundColor = '#496B71'
                }
              }}
              disabled={loading || !password || !confirmPassword}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Updating password...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
