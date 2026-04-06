import { useState, useEffect } from 'react'
import { X, AlertCircle, Landmark } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'

interface WithdrawalRequestModalProps {
  isOpen: boolean
  onClose: () => void
  availableBalance: number // in pence
  onSuccess?: () => void
}

interface WithdrawalLimits {
  min_amount_pence: number
  max_amount_pence: number
}

export function WithdrawalRequestModal({
  isOpen,
  onClose,
  availableBalance,
  onSuccess,
}: WithdrawalRequestModalProps) {
  const { user } = useAuthStore()
  const [amount, setAmount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankSortCode, setBankSortCode] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [limits, setLimits] = useState<WithdrawalLimits>({
    min_amount_pence: 10000, // £100 default
    max_amount_pence: 1000000, // £10000 default
  })

  // Load withdrawal limits from system settings
  useEffect(() => {
    const loadLimits = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'withdrawal_limits')
          .single()

        if (error) throw error

        if (data?.setting_value) {
          const limitsData = data.setting_value as unknown as WithdrawalLimits
          setLimits(limitsData)
        }
      } catch (error) {
        console.error('Error loading withdrawal limits:', error)
      }
    }

    if (isOpen) {
      loadLimits()
    }
  }, [isOpen])

  const handleAmountChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^\d.]/g, '')
    // Only allow one decimal point
    const parts = sanitized.split('.')
    if (parts.length > 2) return
    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) return

    // Check if the amount exceeds the maximum limit or available balance
    if (sanitized && sanitized !== '.') {
      const numericValue = parseFloat(sanitized)
      if (!isNaN(numericValue)) {
        const amountInPence = Math.round(numericValue * 100)
        const maxAllowed = Math.min(limits.max_amount_pence, availableBalance)

        // Prevent entering amount above the limit
        if (amountInPence > maxAllowed) {
          return
        }
      }
    }

    setAmount(sanitized)
  }

  const handleSortCodeChange = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '')
    // Limit to 6 digits
    const limited = digits.slice(0, 6)
    // Format as XX-XX-XX
    let formatted = limited
    if (limited.length > 2) {
      formatted = limited.slice(0, 2) + '-' + limited.slice(2)
    }
    if (limited.length > 4) {
      formatted = limited.slice(0, 2) + '-' + limited.slice(2, 4) + '-' + limited.slice(4)
    }
    setBankSortCode(formatted)
  }

  const handleAccountNumberChange = (value: string) => {
    // Only allow digits, limit to 8
    const sanitized = value.replace(/\D/g, '').slice(0, 8)
    setBankAccountNumber(sanitized)
  }

  const isFormValid = (): boolean => {
    // Check if amount is valid
    if (!amount || parseFloat(amount) <= 0) return false

    const amountPence = Math.round(parseFloat(amount) * 100)

    if (amountPence < limits.min_amount_pence) return false
    if (amountPence > limits.max_amount_pence) return false
    if (amountPence > availableBalance) return false

    // Check bank details
    if (!bankAccountName.trim()) return false
    if (!bankSortCode || bankSortCode.replace(/-/g, '').length !== 6) return false
    if (!bankAccountNumber || bankAccountNumber.length !== 8) return false

    return true
  }

  const validateForm = (): string | null => {
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      return 'Please enter a valid withdrawal amount'
    }

    const amountPence = Math.round(parseFloat(amount) * 100)

    if (amountPence < limits.min_amount_pence) {
      return `Minimum withdrawal amount is £${(limits.min_amount_pence / 100).toFixed(2)}`
    }

    if (amountPence > limits.max_amount_pence) {
      return `Maximum withdrawal amount is £${(limits.max_amount_pence / 100).toFixed(2)}`
    }

    if (amountPence > availableBalance) {
      return 'Insufficient balance for this withdrawal'
    }

    // Validate bank details
    if (!bankAccountName.trim()) {
      return 'Please enter the account holder name'
    }

    if (!bankSortCode || bankSortCode.replace(/-/g, '').length !== 6) {
      return 'Please enter a valid 6-digit sort code'
    }

    if (!bankAccountNumber || bankAccountNumber.length !== 8) {
      return 'Please enter a valid 8-digit account number'
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateForm()
    if (validationError) {
      toast.error(validationError)
      return
    }

    if (!user) {
      toast.error('You must be logged in to request a withdrawal')
      return
    }

    setIsSubmitting(true)

    try {
      const amountPence = Math.round(parseFloat(amount) * 100)

      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: user.id,
        amount_pence: amountPence,
        bank_account_name: bankAccountName.trim(),
        bank_sort_code: bankSortCode.replace(/-/g, ''), // Store without hyphens
        bank_account_number: bankAccountNumber,
        status: 'pending',
      })

      if (error) throw error

      toast.success('Withdrawal request submitted successfully')

      // Email sent automatically by database trigger

      // Reset form
      setAmount('')
      setBankAccountName('')
      setBankSortCode('')
      setBankAccountNumber('')

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error('Error submitting withdrawal request:', error)
      toast.error('Failed to submit withdrawal request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const formIsValid = isFormValid()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh', backgroundColor: '#fffbf7' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="px-6 py-5 border-b" style={{ borderColor: '#e5e7eb' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#335761' }}>
                <Landmark className="size-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#2D251E' }}>
                  Withdrawal Request
                </h2>
                <p className="text-xs" style={{ color: '#666' }}>
                  Transfer funds to your UK bank account
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              disabled={isSubmitting}
            >
              <X size={20} style={{ color: '#666' }} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Info Banner */}
          <div
            className="mb-6 p-4 rounded-xl border"
            style={{ backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 mt-0.5" style={{ color: '#0369a1' }} />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2" style={{ color: '#0c4a6e' }}>
                  Important Information
                </p>
                <div className="space-y-1.5 text-xs" style={{ color: '#075985' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Available Balance:</span>
                    <span className="font-bold" style={{ color: '#0c4a6e' }}>
                      £{(availableBalance / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Limits:</span>
                    <span>
                      £{(limits.min_amount_pence / 100).toFixed(2)} - £
                      {(limits.max_amount_pence / 100).toFixed(2)}
                    </span>
                  </div>
                  <div>• Processed within 3-5 business days</div>
                  <div>• UK bank accounts only</div>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Amount */}
            <div>
              <label className="text-sm font-bold mb-2 block" style={{ color: '#2D251E' }}>
                Withdrawal Amount
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold"
                  style={{ color: '#335761' }}
                >
                  £
                </span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3.5 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#335761] focus:border-[#335761] text-lg font-semibold transition-all"
                  style={{
                    borderColor: amount && parseFloat(amount) > 0 ? '#335761' : '#e5e7eb',
                    backgroundColor: 'white',
                  }}
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs mt-2" style={{ color: '#666' }}>
                Enter between £{(limits.min_amount_pence / 100).toFixed(2)} and £
                {(limits.max_amount_pence / 100).toFixed(2)}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t pt-5" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#2D251E' }}>
                <Landmark className="size-4" />
                Bank Account Details
              </h3>

              {/* Account Holder Name */}
              <div className="mb-4">
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#666' }}>
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#335761] focus:border-[#335761] transition-all"
                  style={{
                    borderColor: bankAccountName.trim() ? '#335761' : '#e5e7eb',
                    backgroundColor: 'white',
                  }}
                  placeholder="e.g., John Smith"
                />
              </div>

              {/* Sort Code */}
              <div className="mb-4">
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#666' }}>
                  Sort Code
                </label>
                <input
                  type="text"
                  value={bankSortCode}
                  onChange={(e) => handleSortCodeChange(e.target.value)}
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#335761] focus:border-[#335761] font-mono text-lg tracking-wider transition-all"
                  style={{
                    borderColor:
                      bankSortCode && bankSortCode.replace(/-/g, '').length === 6
                        ? '#335761'
                        : '#e5e7eb',
                    backgroundColor: 'white',
                  }}
                  placeholder="12-34-56"
                  maxLength={8}
                />
                <p className="text-xs mt-1.5" style={{ color: '#666' }}>
                  6 digits in XX-XX-XX format
                </p>
              </div>

              {/* Account Number */}
              <div>
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#666' }}>
                  Account Number
                </label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => handleAccountNumberChange(e.target.value)}
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#335761] focus:border-[#335761] font-mono text-lg tracking-wider transition-all"
                  style={{
                    borderColor:
                      bankAccountNumber && bankAccountNumber.length === 8 ? '#335761' : '#e5e7eb',
                    backgroundColor: 'white',
                  }}
                  placeholder="12345678"
                  maxLength={8}
                />
                <p className="text-xs mt-1.5" style={{ color: '#666' }}>
                  8-digit account number
                </p>
              </div>
            </div>
          </form>
        </div>

        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: '#e5e7eb', backgroundColor: 'white' }}>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3.5 rounded-xl font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 hover:bg-gray-200"
              style={{ backgroundColor: '#f3f4f6', color: '#2D251E' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isSubmitting || !formIsValid}
              className="flex-1 py-3.5 rounded-xl font-bold text-white transition-all duration-300 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: '#335761' }}
            >
              {isSubmitting ? 'Processing...' : 'Submit Request'}
            </button>
          </div>
          {!formIsValid && !isSubmitting && (
            <p className="text-xs text-center mt-3" style={{ color: '#ef4444' }}>
              Please complete all required fields correctly
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
