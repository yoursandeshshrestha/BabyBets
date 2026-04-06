import { useState, useCallback, useMemo, useEffect } from 'react'
import { DashboardHeader } from '../components'
import {
  Search,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  User,
  Calendar,
  CreditCard,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { useSidebarCounts } from '@/contexts/SidebarCountsContext'
import { toast } from 'sonner'
import { RejectWithdrawalModal } from '@/components/RejectWithdrawalModal'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

type WithdrawalRequest = Database['public']['Tables']['withdrawal_requests']['Row']

interface WithdrawalWithUser extends WithdrawalRequest {
  user_name?: string
  user_email?: string
}

export default function Withdrawals() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingWithdrawal, setRejectingWithdrawal] = useState<WithdrawalWithUser | null>(null)
  const [statusCounts, setStatusCounts] = useState({ pending: 0, approved: 0, paid: 0 })
  const { confirm } = useConfirm()
  const { refreshCounts } = useSidebarCounts()

  // Query builder for infinite scroll
  const queryBuilder = useCallback(() => {
    let query = supabase
      .from('withdrawal_requests')
      .select(`
        *,
        user:profiles!user_id(
          first_name,
          last_name,
          email
        )
      `)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    return query
  }, [statusFilter])

  // Transform function to enrich withdrawal data
  const transformWithdrawals = useCallback(async (rawData: unknown[]): Promise<WithdrawalWithUser[]> => {
    const data = rawData as (WithdrawalRequest & {
      user?: { first_name?: string; last_name?: string; email: string }
    })[]

    return data.map((withdrawal) => {
      const user = withdrawal.user

      return {
        ...withdrawal,
        user_name: user
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User'
          : 'Unknown User',
        user_email: user?.email || 'N/A',
      }
    })
  }, [])

  // Use infinite scroll hook with transformation
  const {
    data: withdrawals,
    loading,
    loadingMore,
    hasMore,
    refresh,
    observerRef,
  } = useInfiniteScroll<Record<string, unknown>, WithdrawalWithUser>({
    queryBuilder: queryBuilder as never,
    pageSize: 10,
    dependencies: [statusFilter],
    transform: transformWithdrawals,
  })

  // Fetch status counts from database
  const fetchStatusCounts = useCallback(async () => {
    try {
      const [pendingResult, approvedResult, paidResult] = await Promise.all([
        supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
      ])

      setStatusCounts({
        pending: pendingResult.count || 0,
        approved: approvedResult.count || 0,
        paid: paidResult.count || 0,
      })
    } catch (error) {
      console.error('Error fetching status counts:', error)
    }
  }, [])

  useEffect(() => {
    fetchStatusCounts()
  }, [])

  // Client-side search filter
  const filteredWithdrawals = useMemo(
    () =>
      withdrawals.filter((withdrawal) => {
        const query = searchQuery.toLowerCase()
        return (
          withdrawal.user_name?.toLowerCase().includes(query) ||
          withdrawal.user_email?.toLowerCase().includes(query) ||
          withdrawal.bank_account_name?.toLowerCase().includes(query)
        )
      }),
    [withdrawals, searchQuery]
  )

  const getStatusBadge = (status: string | null) => {
    const badges: Record<string, { label: string; color: string; icon: typeof Clock }> = {
      pending: { label: 'Pending', color: 'bg-admin-warning-bg text-admin-warning-fg', icon: Clock },
      approved: { label: 'Approved', color: 'bg-admin-info-bg text-admin-info-fg', icon: AlertCircle },
      paid: { label: 'Paid', color: 'bg-admin-success-bg text-admin-success-fg', icon: CheckCircle },
      rejected: { label: 'Rejected', color: 'bg-admin-error-bg text-admin-error-text', icon: XCircle },
    }

    const badge = status ? badges[status] : badges.pending
    const Icon = badge.icon
    return { ...badge, icon: <Icon className="size-3" /> }
  }

  const handleApprove = async (id: string) => {
    const confirmed = await confirm({
      title: 'Approve Withdrawal Request?',
      description: 'This will mark the withdrawal as approved and ready for payment.',
      confirmText: 'Approve',
      cancelText: 'Cancel',
      variant: 'default',
    })

    if (!confirmed) return

    try {
      setProcessingId(id)
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      toast.success('Withdrawal request approved')
      await refresh()
      await refreshCounts()
      await fetchStatusCounts()
    } catch (error) {
      console.error('Error approving withdrawal:', error)
      toast.error('Failed to approve withdrawal request')
    } finally {
      setProcessingId(null)
    }
  }

  const handleMarkAsPaid = async (id: string) => {
    const withdrawal = withdrawals.find(w => w.id === id)
    if (!withdrawal) return

    const confirmed = await confirm({
      title: 'Mark Withdrawal as Paid?',
      description: 'This will deduct the amount from the user\'s wallet and mark the withdrawal as completed and paid.',
      confirmText: 'Mark as Paid',
      cancelText: 'Cancel',
      variant: 'default',
    })

    if (!confirmed) return

    try {
      setProcessingId(id)

      // Call the database function to process the withdrawal payment
      // This will deduct from wallet and mark as paid atomically
      const { error } = await supabase.rpc('process_withdrawal_payment', {
        p_withdrawal_id: id
      })

      if (error) throw error

      toast.success('Withdrawal processed successfully')

      // Email sent automatically by database trigger

      await refresh()
      await refreshCounts()
      await fetchStatusCounts()
    } catch (error) {
      console.error('Error marking withdrawal as paid:', error)
      toast.error(
        `Failed to process withdrawal: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id: string) => {
    const withdrawal = withdrawals.find(w => w.id === id)
    if (!withdrawal) return

    setRejectingWithdrawal(withdrawal)
    setShowRejectModal(true)
  }

  const handleConfirmReject = async (reason: string) => {
    if (!rejectingWithdrawal) return

    try {
      setProcessingId(rejectingWithdrawal.id)
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', rejectingWithdrawal.id)

      if (error) throw error

      toast.success('Withdrawal request rejected')

      // Email sent automatically by database trigger

      setShowRejectModal(false)
      setRejectingWithdrawal(null)
      await refresh()
      await refreshCounts()
      await fetchStatusCounts()
    } catch (error) {
      console.error('Error rejecting withdrawal:', error)
      toast.error('Failed to reject withdrawal request')
    } finally {
      setProcessingId(null)
    }
  }

  const handleExport = () => {
    const csv = [
      [
        'User Name',
        'Email',
        'Amount',
        'Status',
        'Bank Name',
        'Sort Code',
        'Account Number',
        'Requested Date',
        'Paid Date',
      ].join(','),
      ...filteredWithdrawals.map((w) =>
        [
          w.user_name || 'N/A',
          w.user_email || 'N/A',
          `£${(w.amount_pence / 100).toFixed(2)}`,
          w.status || 'pending',
          w.bank_account_name || 'N/A',
          w.bank_sort_code || 'N/A',
          w.bank_account_number || 'N/A',
          w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB') : 'N/A',
          w.paid_at ? new Date(w.paid_at).toLocaleDateString('en-GB') : 'N/A',
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `withdrawals-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <>
      <DashboardHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Withdrawals' },
        ]}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                Withdrawal Requests
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage user withdrawal requests and payments
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={filteredWithdrawals.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-admin-success-fg text-white rounded-lg hover:bg-admin-success-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="size-4" />
              Export CSV
            </button>
          </div>

          {/* Info Banner */}
          {statusCounts.approved > 0 && (
            <div className="bg-admin-info-bg border border-admin-info-fg rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="size-5 text-admin-info-fg shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {statusCounts.approved} withdrawal{statusCounts.approved !== 1 ? 's' : ''} approved and awaiting
                    payment
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All approved withdrawals should be paid within 48 hours
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-admin-card-bg border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-admin-warning-bg rounded-lg">
                  <Clock className="size-6 text-admin-warning-fg" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                  <div className="text-2xl font-semibold">{statusCounts.pending}</div>
                </div>
              </div>
            </div>
            <div className="bg-admin-card-bg border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-admin-info-bg rounded-lg">
                  <AlertCircle className="size-6 text-admin-info-fg" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">To Pay</div>
                  <div className="text-2xl font-semibold">{statusCounts.approved}</div>
                </div>
              </div>
            </div>
            <div className="bg-admin-card-bg border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-admin-success-bg rounded-lg">
                  <CheckCircle className="size-6 text-admin-success-fg" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Paid</div>
                  <div className="text-2xl font-semibold">{statusCounts.paid}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-admin-card-bg border border-border rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or bank account..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-admin-info-fg"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Withdrawals Grid */}
          {loading ? (
            <div className="p-8 text-center bg-admin-card-bg rounded-lg border border-border">
              <div className="inline-block size-8 border-4 border-admin-gray-bg border-t-admin-info-fg rounded-full animate-spin"></div>
              <p className="mt-2 text-muted-foreground">Loading withdrawals...</p>
            </div>
          ) : filteredWithdrawals.length === 0 ? (
            <div className="p-16 text-center bg-admin-card-bg rounded-lg border border-border">
              <DollarSign className="size-12 text-admin-gray-bg mx-auto mb-4" />
              <p className="text-muted-foreground">No withdrawal requests found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredWithdrawals.map((withdrawal) => {
                const badge = getStatusBadge(withdrawal.status)

                return (
                  <div
                    key={withdrawal.id}
                    className="bg-admin-card-bg rounded-lg border border-border p-6"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="size-12 rounded-lg bg-admin-success-bg text-admin-success-fg flex items-center justify-center">
                          <DollarSign className="size-6" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground text-lg">
                            £{(withdrawal.amount_pence / 100).toFixed(2)}
                          </h3>
                          <p className="text-sm text-muted-foreground">Withdrawal Amount</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg ${badge.color}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>

                    {/* User Info */}
                    <div className="flex items-center gap-2 mb-4 text-sm">
                      <User className="size-4 text-muted-foreground" />
                      <span className="text-foreground font-medium">{withdrawal.user_name}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">{withdrawal.user_email}</span>
                    </div>

                    {/* Bank Details */}
                    <div className="bg-admin-hover-bg rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase mb-2">
                        <CreditCard className="size-3" />
                        Bank Details
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-foreground font-medium">
                          {withdrawal.bank_account_name || 'N/A'}
                        </p>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>Sort Code: {withdrawal.bank_sort_code || 'N/A'}</span>
                          <span>Account: {withdrawal.bank_account_number || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Request Date */}
                    <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                      <Calendar className="size-4" />
                      <span>
                        Requested:{' '}
                        {withdrawal.created_at
                          ? new Date(withdrawal.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'N/A'}
                      </span>
                    </div>

                    {/* Rejection Reason */}
                    {withdrawal.status === 'rejected' && withdrawal.rejection_reason && (
                      <div className="mb-4 bg-admin-error-bg border border-admin-error-border rounded-lg p-3">
                        <p className="text-xs text-admin-error-text font-medium uppercase mb-1">
                          Rejection Reason
                        </p>
                        <p className="text-sm text-admin-error-text">{withdrawal.rejection_reason}</p>
                      </div>
                    )}

                    {/* Admin Notes */}
                    {withdrawal.admin_notes && (
                      <div className="mb-4 text-sm">
                        <p className="text-xs text-muted-foreground font-medium uppercase mb-1">
                          Admin Notes
                        </p>
                        <p className="text-foreground">{withdrawal.admin_notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {withdrawal.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(withdrawal.id)}
                            disabled={processingId === withdrawal.id}
                          >
                            <CheckCircle className="size-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(withdrawal.id)}
                            disabled={processingId === withdrawal.id}
                            className="text-white"
                          >
                            <XCircle className="size-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {withdrawal.status === 'approved' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAsPaid(withdrawal.id)}
                          disabled={processingId === withdrawal.id}
                        >
                          <CheckCircle className="size-4 mr-1" />
                          Mark as Paid
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>

              {/* Infinite Scroll Sentinel */}
              {hasMore && (
                <div ref={observerRef} className="p-4 text-center">
                  {loadingMore && (
                    <div className="flex items-center justify-center gap-2">
                      <div className="size-5 border-2 border-admin-gray-bg border-t-admin-info-fg rounded-full animate-spin"></div>
                      <span className="text-sm text-muted-foreground">Loading more withdrawals...</span>
                    </div>
                  )}
                </div>
              )}

              {/* End of Results Message */}
              {!hasMore && filteredWithdrawals.length > 0 && (
                <div className="p-4 text-center">
                  <span className="text-sm text-muted-foreground">
                    All withdrawals loaded ({filteredWithdrawals.length} total)
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reject Withdrawal Modal */}
      <RejectWithdrawalModal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false)
          setRejectingWithdrawal(null)
        }}
        onConfirm={handleConfirmReject}
        withdrawalAmount={rejectingWithdrawal?.amount_pence || 0}
        isSubmitting={processingId === rejectingWithdrawal?.id}
      />
    </>
  )
}
