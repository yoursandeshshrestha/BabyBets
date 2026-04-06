import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/index'
import { showErrorToast, showSuccessToast } from '@/lib/toast'

interface AddBalanceDialogProps {
  user: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddBalanceDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: AddBalanceDialogProps) {
  const [amount, setAmount] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [expiryDays, setExpiryDays] = useState<string>('30')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount('')
      setDescription('Admin credit added')
      setExpiryDays('30')
    }
  }, [open])

  const handleSave = async () => {
    if (!user || !amount || parseFloat(amount) <= 0) {
      showErrorToast('Please enter a valid amount')
      return
    }

    if (!description.trim()) {
      showErrorToast('Please enter a description')
      return
    }

    if (!expiryDays || parseInt(expiryDays) <= 0) {
      showErrorToast('Please enter valid expiry days')
      return
    }

    try {
      setSaving(true)

      const amountPence = Math.round(parseFloat(amount) * 100)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays))

      // Insert wallet credit (transaction is auto-created by database trigger)
      const { error: creditError } = await supabase.from('wallet_credits').insert({
        user_id: user.id,
        amount_pence: amountPence,
        remaining_pence: amountPence,
        description: description.trim(),
        source_type: 'admin_credit',
        status: 'active',
        expires_at: expiresAt.toISOString(),
      })

      if (creditError) throw creditError

      // Email and transaction are automatically created by database triggers

      // Success - close dialog and refresh
      showSuccessToast('Balance added successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error adding wallet balance:', error)
      showErrorToast('Failed to add balance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Wallet Balance</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3 pb-6 -mx-6 px-6 border-b border-gray-200">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.first_name || user.email}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <div className="size-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-medium">
                  {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-medium text-foreground">
                  {user.first_name || user.last_name
                    ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                    : 'No name'}
                </div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Amount (GBP) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Enter the amount to add to the user's wallet
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Admin credit added, Compensation, etc."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              This will be visible to the user in their transaction history
            </p>
          </div>

          {/* Expiry Days */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Expires In (Days) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              placeholder="30"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Number of days until this credit expires
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 -mx-6 px-6 border-t border-gray-200">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !amount || !description.trim() || !expiryDays}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Adding...' : 'Add Balance'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
