import { useState, useCallback, useMemo, useEffect } from 'react'
import { DashboardHeader } from '../components'
import {
  Search,
  Gift,
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  Download,
  Wallet,
  Eye,
  User,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Database } from '@/types/database.types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { showSuccessToast, showErrorToast } from '@/lib/toast'
import { useSidebarCounts } from '@/contexts/SidebarCountsContext'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

type PrizeFulfillment = Database['public']['Tables']['prize_fulfillments']['Row']
type FulfillmentStatus = Database['public']['Enums']['fulfillment_status']

interface FulfillmentWithDetails extends PrizeFulfillment {
  user_name?: string
  user_email?: string
  competition_title?: string
  prize_name?: string
  prize_type?: string
  prize_value_gbp?: number
}

interface ConfirmDialogState {
  open: boolean
  title: string
  description: string
  onConfirm: () => void | Promise<void>
  confirmText?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
}

export default function Fulfillments() {
  const { user } = useAuthStore()
  const { refreshCounts } = useSidebarCounts()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [choiceFilter, setChoiceFilter] = useState<string>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedFulfillment, setSelectedFulfillment] = useState<FulfillmentWithDetails | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  })
  const [trackingNumberInput, setTrackingNumberInput] = useState('')
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false)
  const [voucherCodeInput, setVoucherCodeInput] = useState('')
  const [voucherDescriptionInput, setVoucherDescriptionInput] = useState('')
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false)
  const [statusCounts, setStatusCounts] = useState({ pending: 0, processing: 0, dispatched: 0 })

  // Query builder for infinite scroll
  const queryBuilder = useCallback(() => {
    let query = supabase
      .from('prize_fulfillments')
      .select(`
        *,
        user:profiles!user_id(
          first_name,
          last_name,
          email
        ),
        competition:competitions!competition_id(title)
      `)
      .order('updated_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as FulfillmentStatus)
    }

    if (choiceFilter !== 'all') {
      query = query.eq('choice', choiceFilter)
    }

    return query
  }, [statusFilter, choiceFilter])

  // Transform function to enrich fulfillment data
  const transformFulfillments = useCallback(async (rawData: unknown[]): Promise<FulfillmentWithDetails[]> => {
    const data = rawData as (PrizeFulfillment & {
      user?: { first_name?: string; last_name?: string; email: string }
      competition?: { title: string }
    })[]

    // Fetch winners separately by ticket_id
    const ticketIds = data
      .map((f) => f.ticket_id)
      .filter((id): id is string => !!id)

    let winnersMap: Record<string, { prize_name: string; prize_value_gbp?: number; win_type?: string }> = {}

    if (ticketIds.length > 0) {
      const { data: winnersData } = await supabase
        .from('winners')
        .select('ticket_id, prize_name, prize_value_gbp, win_type')
        .in('ticket_id', ticketIds)

      winnersMap = (winnersData || []).reduce((acc, winner) => {
        if (winner.ticket_id) {
          acc[winner.ticket_id] = {
            prize_name: winner.prize_name,
            prize_value_gbp: winner.prize_value_gbp ?? undefined,
            win_type: winner.win_type ?? undefined,
          }
        }
        return acc
      }, {} as Record<string, { prize_name: string; prize_value_gbp?: number; win_type?: string }>)
    }

    // Fetch prize types from prize_templates
    const prizeIds = data
      .map((f) => f.prize_id)
      .filter((id): id is string => !!id)

    let prizeTypesMap: Record<string, string> = {}

    if (prizeIds.length > 0) {
      const { data: compPrizesData } = await supabase
        .from('competition_instant_win_prizes')
        .select('id, prize_template_id')
        .in('id', prizeIds)

      if (compPrizesData) {
        const templateIds = compPrizesData
          .map((cp) => cp.prize_template_id)
          .filter((id): id is string => !!id)

        if (templateIds.length > 0) {
          const { data: templatesData } = await supabase
            .from('prize_templates')
            .select('id, type')
            .in('id', templateIds)

          if (templatesData) {
            const templateTypeMap: Record<string, string> = {}
            templatesData.forEach((t) => {
              if (t.id) templateTypeMap[t.id] = t.type
            })

            compPrizesData.forEach((cp) => {
              if (cp.id && cp.prize_template_id) {
                prizeTypesMap[cp.id] = templateTypeMap[cp.prize_template_id] || 'Physical'
              }
            })
          }
        }
      }
    }

    // Transform data
    return data.map((fulfillment) => {
      const user = fulfillment.user
      const competition = fulfillment.competition
      const winner = winnersMap[fulfillment.ticket_id]

      let prizeType = 'Physical'
      if (fulfillment.prize_id) {
        prizeType = prizeTypesMap[fulfillment.prize_id] || 'Physical'
      }

      return {
        ...fulfillment,
        user_name: user
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User'
          : 'Unknown User',
        user_email: user?.email || 'N/A',
        competition_title: competition?.title || 'Unknown Competition',
        prize_name: winner?.prize_name || 'Unknown Prize',
        prize_value_gbp: winner?.prize_value_gbp,
        prize_type: prizeType,
      }
    })
  }, [])

  // Use infinite scroll hook with transformation
  const {
    data: fulfillments,
    loading,
    loadingMore,
    hasMore,
    refresh,
    observerRef,
  } = useInfiniteScroll<Record<string, unknown>, FulfillmentWithDetails>({
    queryBuilder: queryBuilder as never,
    pageSize: 10,
    dependencies: [statusFilter, choiceFilter],
    transform: transformFulfillments,
  })

  // Fetch status counts from database
  const fetchStatusCounts = useCallback(async () => {
    try {
      // Fetch pending count (includes pending, prize_selected, cash_selected)
      const { count: pendingCount } = await supabase
        .from('prize_fulfillments')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'prize_selected', 'cash_selected'])

      const { count: processingCount } = await supabase
        .from('prize_fulfillments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processing')

      const { count: dispatchedCount } = await supabase
        .from('prize_fulfillments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'dispatched')

      setStatusCounts({
        pending: pendingCount || 0,
        processing: processingCount || 0,
        dispatched: dispatchedCount || 0,
      })
    } catch (error) {
      console.error('Error fetching status counts:', error)
    }
  }, [])

  useEffect(() => {
    fetchStatusCounts()
  }, [fetchStatusCounts])

  // Client-side search filter
  const filteredFulfillments = useMemo(
    () =>
      fulfillments.filter((fulfillment) => {
        const query = searchQuery.toLowerCase()
        return (
          fulfillment.user_name?.toLowerCase().includes(query) ||
          fulfillment.user_email?.toLowerCase().includes(query) ||
          fulfillment.prize_name?.toLowerCase().includes(query) ||
          fulfillment.competition_title?.toLowerCase().includes(query)
        )
      }),
    [fulfillments, searchQuery]
  )

  const getStatusBadge = (status: FulfillmentStatus | null) => {
    const badges: Record<FulfillmentStatus, { label: string; color: string }> = {
      pending: { label: 'Pending', color: 'bg-admin-warning-bg text-admin-warning-fg' },
      prize_selected: { label: 'Prize Selected', color: 'bg-admin-info-bg text-admin-info-fg' },
      cash_selected: { label: 'Cash Selected', color: 'bg-admin-purple-bg text-admin-purple-fg' },
      processing: { label: 'Processing', color: 'bg-admin-orange-bg text-admin-orange-fg' },
      dispatched: { label: 'Dispatched', color: 'bg-admin-purple-bg text-admin-purple-fg' },
      delivered: { label: 'Delivered', color: 'bg-admin-success-bg text-admin-success-fg' },
      completed: { label: 'Completed', color: 'bg-admin-success-bg text-admin-success-fg' },
      expired: { label: 'Expired', color: 'bg-admin-error-bg text-admin-error-text' },
    }

    return status ? badges[status] : { label: 'Pending', color: 'bg-admin-gray-bg text-admin-gray-text' }
  }

  const handleApproveCashAlternative = async (fulfillmentId: string, userId: string) => {
    try {
      setProcessingId(fulfillmentId)

      const { data, error } = await supabase.rpc('approve_cash_alternative' as any, {
        p_fulfillment_id: fulfillmentId,
        p_admin_id: userId,
      }) as { data: { amount_gbp: number; expires_at: string } | null; error: any }

      if (error) throw error

      if (data) {
        showSuccessToast(
          `Cash alternative approved! £${data.amount_gbp} added to user's wallet. Expires: ${new Date(
            data.expires_at
          ).toLocaleDateString()}`
        )
      }

      await refresh()
      await refreshCounts()
      await fetchStatusCounts()
      setDetailsOpen(false)
    } catch (error) {
      console.error('Error approving cash alternative:', error)
      showErrorToast('Failed to approve cash alternative. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleUpdateStatus = async (
    id: string,
    newStatus: FulfillmentStatus,
    trackingNumber?: string
  ) => {
    try {
      setProcessingId(id)
      const updates: Partial<PrizeFulfillment> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === 'dispatched') {
        updates.dispatched_at = new Date().toISOString()
        if (trackingNumber) {
          updates.tracking_number = trackingNumber
        }
      }

      if (newStatus === 'delivered') {
        updates.delivered_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('prize_fulfillments')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      // Send prize fulfillment update email (non-blocking) for dispatched and delivered
      if (newStatus === 'dispatched' || newStatus === 'delivered') {
        const fulfillment = fulfillments.find(f => f.id === id)
        if (fulfillment?.user_email && fulfillment.user_name && fulfillment.prize_name) {
          const statusMessages: Record<string, string> = {
            dispatched: 'shipped',
            delivered: 'delivered'
          }

          // Email sent automatically by database trigger on prize_fulfillments UPDATE
        }
      }

      await refresh()
      await refreshCounts()
      await fetchStatusCounts()

      // Close details dialog if the fulfillment is completed
      if (newStatus === 'completed') {
        setDetailsOpen(false)
        showSuccessToast('Fulfillment marked as completed')
      } else {
        if (selectedFulfillment?.id === id) {
          // Update the selected fulfillment with the new status immediately
          const updatedFulfillment: FulfillmentWithDetails = {
            ...selectedFulfillment,
            status: newStatus,
            updated_at: updates.updated_at ?? null,
            ...(newStatus === 'dispatched' && trackingNumber ? { tracking_number: trackingNumber, dispatched_at: updates.dispatched_at } : {}),
            ...(newStatus === 'dispatched' && !trackingNumber ? { dispatched_at: updates.dispatched_at } : {}),
            ...(newStatus === 'delivered' ? { delivered_at: updates.delivered_at } : {})
          }
          setSelectedFulfillment(updatedFulfillment)
        }
      }
    } catch (error) {
      console.error('Error updating fulfillment status:', error)
      showErrorToast('Failed to update fulfillment status')
    } finally {
      setProcessingId(null)
    }
  }

  const handleProvideVoucherCode = async (
    id: string,
    voucherCode: string,
    description?: string
  ) => {
    try {
      setProcessingId(id)

      const updates: any = {
        status: 'completed',
        voucher_code: voucherCode,
        voucher_description: description || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('prize_fulfillments')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      await refresh()
      await refreshCounts()
      await fetchStatusCounts()
      setDetailsOpen(false)
      showSuccessToast('Voucher code provided successfully')
    } catch (error) {
      console.error('Error providing voucher code:', error)
      showErrorToast('Failed to provide voucher code')
    } finally {
      setProcessingId(null)
    }
  }

  const handleExport = () => {
    const csv = [
      [
        'User Name',
        'Email',
        'Competition',
        'Prize',
        'Value',
        'Choice',
        'Status',
        'Claimed Date',
        'Tracking Number',
      ].join(','),
      ...filteredFulfillments.map((f) =>
        [
          f.user_name || 'N/A',
          f.user_email || 'N/A',
          f.competition_title || 'N/A',
          f.prize_name || 'N/A',
          f.prize_value_gbp || '0',
          f.choice || 'N/A',
          f.status || 'pending',
          f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB') : 'N/A',
          f.tracking_number || 'N/A',
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fulfillments-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const openDetails = (fulfillment: FulfillmentWithDetails) => {
    setSelectedFulfillment(fulfillment)
    setDetailsOpen(true)
  }

  return (
    <>
      <DashboardHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Fulfillments' },
        ]}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Gift className="size-6" />
                Prize Fulfillments
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage prize claims and delivery status
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={filteredFulfillments.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-admin-success-fg text-white rounded-lg hover:bg-admin-success-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="size-4" />
              Export CSV
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-admin-card-bg border border-border rounded-lg p-6">
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
            <div className="bg-admin-card-bg border border-border rounded-lg p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-admin-orange-bg rounded-lg">
                  <Package className="size-6 text-admin-orange-fg" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Processing</div>
                  <div className="text-2xl font-semibold">{statusCounts.processing}</div>
                </div>
              </div>
            </div>
            <div className="bg-admin-card-bg border border-border rounded-lg p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-admin-purple-bg rounded-lg">
                  <Truck className="size-6 text-admin-purple-fg" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Dispatched</div>
                  <div className="text-2xl font-semibold">{statusCounts.dispatched}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-admin-card-bg border border-border rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name, prize, email, or competition..."
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
                    <SelectItem value="prize_selected">Prize Selected</SelectItem>
                    <SelectItem value="cash_selected">Cash Selected</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Choice Filter */}
              <div>
                <Select value={choiceFilter} onValueChange={setChoiceFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Choices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Choices</SelectItem>
                    <SelectItem value="physical">Physical Prize</SelectItem>
                    <SelectItem value="cash">Cash Alternative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Fulfillments Table */}
          <div className="bg-admin-card-bg border border-border rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-block size-8 border-4 border-admin-gray-bg border-t-admin-info-fg rounded-full animate-spin"></div>
                <p className="mt-2 text-muted-foreground">Loading fulfillments...</p>
              </div>
            ) : filteredFulfillments.length === 0 ? (
              <div className="p-8 text-center">
                <Gift className="size-12 text-admin-gray-bg mx-auto mb-4" />
                <p className="text-muted-foreground">No fulfillments found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-admin-hover-bg border-b border-border">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Prize
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Claimed
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredFulfillments.map((fulfillment) => {
                      const badge = getStatusBadge(fulfillment.status)

                      return (
                        <tr
                          key={fulfillment.id}
                          className="hover:bg-admin-hover-bg cursor-pointer"
                          onClick={() => openDetails(fulfillment)}
                        >
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-foreground">
                              {fulfillment.user_name}
                            </div>
                            <div className="text-sm text-muted-foreground">{fulfillment.user_email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-foreground">
                              {fulfillment.prize_name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {fulfillment.competition_title}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground">
                            {fulfillment.prize_value_gbp
                              ? `£${fulfillment.prize_value_gbp.toFixed(2)}`
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-admin-gray-bg text-admin-gray-text">
                              {fulfillment.choice === 'cash' ? (
                                <>
                                  <Wallet className="size-3" />
                                  Cash Alternative
                                </>
                              ) : fulfillment.prize_type === 'Physical' ? (
                                <>
                                  <Gift className="size-3" />
                                  Physical
                                </>
                              ) : fulfillment.prize_type === 'SiteCredit' ? (
                                <>
                                  <Wallet className="size-3" />
                                  Site Credit
                                </>
                              ) : fulfillment.prize_type === 'Voucher' ? (
                                <>
                                  <Gift className="size-3" />
                                  Voucher
                                </>
                              ) : fulfillment.prize_type === 'Cash' ? (
                                <>
                                  <Wallet className="size-3" />
                                  Cash
                                </>
                              ) : (
                                <>
                                  <Gift className="size-3" />
                                  {fulfillment.prize_type || 'Physical'}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {fulfillment.created_at
                              ? new Date(fulfillment.created_at).toLocaleDateString('en-GB')
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openDetails(fulfillment)
                              }}
                              className="inline-flex items-center gap-1.5 text-admin-info-fg hover:text-admin-info-text font-medium text-sm cursor-pointer"
                            >
                              <Eye className="size-4" />
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Infinite Scroll Sentinel */}
                {hasMore && (
                  <div ref={observerRef} className="p-4 text-center">
                    {loadingMore && (
                      <div className="flex items-center justify-center gap-2">
                        <div className="size-5 border-2 border-admin-gray-bg border-t-admin-info-fg rounded-full animate-spin"></div>
                        <span className="text-sm text-muted-foreground">Loading more...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* End of Results Message */}
                {!hasMore && filteredFulfillments.length > 0 && (
                  <div className="p-4 text-center">
                    <span className="text-sm text-muted-foreground">
                      All fulfillments loaded ({filteredFulfillments.length} total)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          {selectedFulfillment && (
            <>
              {/* Fixed Header */}
              <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-xl">Fulfillment Details</DialogTitle>
                </DialogHeader>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {/* User Information */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                    <User className="size-4" />
                    User Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Name:</span>
                      <p className="font-medium text-gray-900">{selectedFulfillment.user_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <p className="font-medium text-gray-900">{selectedFulfillment.user_email}</p>
                    </div>
                  </div>
                </div>

                {/* Prize Information */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                    <Gift className="size-4" />
                    Prize Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Prize:</span>
                      <p className="font-medium text-gray-900">{selectedFulfillment.prize_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Competition:</span>
                      <p className="font-medium text-gray-900">{selectedFulfillment.competition_title}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Value:</span>
                      <p className="font-medium text-gray-900">£{selectedFulfillment.prize_value_gbp?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Type:</span>
                      <p className="font-medium text-gray-900">
                        {selectedFulfillment.choice === 'cash'
                          ? 'Cash Alternative'
                          : selectedFulfillment.prize_type === 'Voucher'
                          ? 'Voucher'
                          : selectedFulfillment.prize_type === 'GiftCard'
                          ? 'Gift Card'
                          : selectedFulfillment.prize_type === 'SiteCredit'
                          ? 'Site Credit'
                          : selectedFulfillment.prize_type === 'Cash'
                          ? 'Cash Prize'
                          : 'Physical Prize'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          getStatusBadge(selectedFulfillment.status).color
                        }`}
                      >
                        {getStatusBadge(selectedFulfillment.status).label}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Claimed:</span>
                      <p className="font-medium text-gray-900">
                        {selectedFulfillment.created_at
                          ? new Date(selectedFulfillment.created_at).toLocaleDateString('en-GB')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Delivery Address - Only for physical prizes */}
                {selectedFulfillment.prize_type !== 'Cash' &&
                  (selectedFulfillment.choice === 'physical' || selectedFulfillment.choice === 'prize') &&
                  selectedFulfillment.delivery_address && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                        <MapPin className="size-4" />
                        Delivery Address
                      </h4>
                      <div className="text-sm space-y-1">
                        {typeof selectedFulfillment.delivery_address === 'object' ? (
                          <>
                            <p className="font-medium text-gray-900">
                              {(selectedFulfillment.delivery_address as { fullName?: string }).fullName}
                            </p>
                            <p className="text-gray-700">
                              {(selectedFulfillment.delivery_address as { addressLine1?: string; line1?: string }).addressLine1 ||
                               (selectedFulfillment.delivery_address as { addressLine1?: string; line1?: string }).line1}
                            </p>
                            {((selectedFulfillment.delivery_address as { addressLine2?: string; line2?: string }).addressLine2 ||
                              (selectedFulfillment.delivery_address as { addressLine2?: string; line2?: string }).line2) && (
                              <p className="text-gray-700">
                                {(selectedFulfillment.delivery_address as { addressLine2?: string; line2?: string }).addressLine2 ||
                                 (selectedFulfillment.delivery_address as { addressLine2?: string; line2?: string }).line2}
                              </p>
                            )}
                            <p className="text-gray-700">
                              {(selectedFulfillment.delivery_address as { city?: string }).city}
                            </p>
                            <p className="text-gray-700">
                              {(selectedFulfillment.delivery_address as { postcode?: string }).postcode}
                            </p>
                            <p className="text-gray-700">
                              {(selectedFulfillment.delivery_address as { country?: string }).country || 'United Kingdom'}
                            </p>
                            <p className="text-gray-600 pt-2 font-medium">
                              Phone: {(selectedFulfillment.delivery_address as { phoneNumber?: string; phone?: string }).phoneNumber ||
                                      (selectedFulfillment.delivery_address as { phoneNumber?: string; phone?: string }).phone}
                            </p>
                          </>
                        ) : (
                          <p className="text-gray-700">{String(selectedFulfillment.delivery_address)}</p>
                        )}
                      </div>
                    </div>
                  )}

                {/* Tracking Number - Only for physical prizes */}
                {selectedFulfillment.prize_type !== 'Cash' && selectedFulfillment.tracking_number && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                      <Truck className="size-4" />
                      Tracking Information
                    </h4>
                    <p className="font-mono text-sm text-gray-900">{selectedFulfillment.tracking_number}</p>
                  </div>
                )}

                {/* Cash Prize Info */}
                {selectedFulfillment.prize_type === 'Cash' && selectedFulfillment.status !== 'completed' && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-900">
                      <Wallet className="size-4" />
                      Cash Prize
                    </h4>
                    <p className="text-sm text-gray-700">
                      Mark as paid to complete this cash prize fulfillment of £
                      {selectedFulfillment.prize_value_gbp?.toFixed(2)}.
                    </p>
                  </div>
                )}

                {/* Completed Cash Prize */}
                {selectedFulfillment.prize_type === 'Cash' && selectedFulfillment.status === 'completed' && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                      <CheckCircle className="size-4" />
                      Cash Prize Paid
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Amount:</span>
                        <p className="font-semibold text-gray-900">
                          £{selectedFulfillment.prize_value_gbp?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <p className="font-medium text-gray-900">Paid</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cash Alternative Info */}
                {selectedFulfillment.choice === 'cash' &&
                  (selectedFulfillment.status === 'cash_selected' ||
                    selectedFulfillment.status === 'processing') && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-900">
                        <Wallet className="size-4" />
                        Cash Alternative
                      </h4>
                      <p className="text-sm text-gray-700">
                        Winner selected cash alternative. Approve to add £
                        {selectedFulfillment.prize_value_gbp?.toFixed(2)} to their wallet balance.
                      </p>
                    </div>
                  )}

                {/* Completed Wallet Credit */}
                {selectedFulfillment.choice === 'cash' && selectedFulfillment.status === 'completed' && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                      <CheckCircle className="size-4" />
                      Wallet Credit Added
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Amount:</span>
                        <p className="font-semibold text-gray-900">
                          £{selectedFulfillment.prize_value_gbp?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Expires:</span>
                        <p className="font-medium text-gray-900">90 days</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Voucher/Gift Card Information */}
                {(selectedFulfillment.prize_type === 'Voucher' || selectedFulfillment.prize_type === 'GiftCard') &&
                  selectedFulfillment.status === 'completed' &&
                  (selectedFulfillment as any).voucher_code && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                        <Gift className="size-4" />
                        Voucher/Gift Card Details
                      </h4>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-gray-600">Code:</span>
                          <p className="font-mono text-base font-semibold text-gray-900 mt-1">
                            {(selectedFulfillment as any).voucher_code}
                          </p>
                        </div>
                        {(selectedFulfillment as any).voucher_description && (
                          <div>
                            <span className="text-gray-600">Instructions:</span>
                            <p className="text-gray-700 mt-1">{(selectedFulfillment as any).voucher_description}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* Notes */}
                {selectedFulfillment.notes && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <h4 className="font-semibold mb-3 text-gray-900">Admin Notes</h4>
                    <p className="text-sm text-gray-700">
                      {selectedFulfillment.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Fixed Footer - Actions */}
              <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white rounded-b-lg">
                <div className="flex gap-2 flex-wrap">
                  {/* Cash Prize - Simple Paid button */}
                  {selectedFulfillment.prize_type === 'Cash' && selectedFulfillment.status !== 'completed' && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDialog({
                          open: true,
                          title: 'Mark as Paid',
                          description: `Mark £${selectedFulfillment.prize_value_gbp?.toFixed(2)} cash prize as paid for ${selectedFulfillment.user_email}?`,
                          confirmText: 'Mark as Paid',
                          onConfirm: async () => {
                            setConfirmDialog(prev => ({ ...prev, open: false }))
                            await handleUpdateStatus(selectedFulfillment.id, 'completed')
                          }
                        })
                      }}
                      disabled={processingId === selectedFulfillment.id}
                      className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                    >
                      {processingId === selectedFulfillment.id ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="size-4 mr-2" />
                      )}
                      Mark as Paid
                    </Button>
                  )}

                  {/* Physical Prize Flow */}
                  {selectedFulfillment.prize_type !== 'Cash' &&
                    selectedFulfillment.prize_type !== 'Voucher' &&
                    selectedFulfillment.prize_type !== 'GiftCard' &&
                    selectedFulfillment.status === 'prize_selected' &&
                    (selectedFulfillment.choice === 'physical' || selectedFulfillment.choice === 'prize') && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUpdateStatus(selectedFulfillment.id, 'processing')
                        }}
                        disabled={processingId === selectedFulfillment.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                      >
                        {processingId === selectedFulfillment.id ? (
                          <Loader2 className="size-4 mr-2 animate-spin" />
                        ) : (
                          <Package className="size-4 mr-2" />
                        )}
                        Start Processing
                      </Button>
                    )}

                  {selectedFulfillment.prize_type !== 'Cash' && selectedFulfillment.status === 'processing' &&
                    (selectedFulfillment.choice === 'physical' || selectedFulfillment.choice === 'prize') &&
                    selectedFulfillment.prize_type !== 'Voucher' &&
                    selectedFulfillment.prize_type !== 'GiftCard' && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          setTrackingNumberInput('')
                          setTrackingDialogOpen(true)
                        }}
                        disabled={processingId === selectedFulfillment.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer"
                      >
                        <Truck className="size-4 mr-2" />
                        Mark Dispatched
                      </Button>
                    )}

                  {/* Voucher/Gift Card Flow */}
                  {(selectedFulfillment.prize_type === 'Voucher' || selectedFulfillment.prize_type === 'GiftCard') &&
                    (selectedFulfillment.status === 'prize_selected' || selectedFulfillment.status === 'processing') &&
                    (selectedFulfillment.choice === 'physical' || selectedFulfillment.choice === 'prize') && (
                      <Button
                        onClick={(e) => {
                          
                          e.stopPropagation()
                          setVoucherCodeInput('')
                          setVoucherDescriptionInput('')
                          setVoucherDialogOpen(true)
                        }}
                        disabled={processingId === selectedFulfillment.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                      >
                        {processingId === selectedFulfillment.id ? (
                          <Loader2 className="size-4 mr-2 animate-spin" />
                        ) : (
                          <Gift className="size-4 mr-2" />
                        )}
                        Provide Voucher Code
                      </Button>
                    )}

                  {/* Cash Alternative Flow (when user chose cash instead of physical) */}
                  {(selectedFulfillment.status === 'cash_selected' ||
                    selectedFulfillment.status === 'processing') &&
                    selectedFulfillment.choice === 'cash' &&
                    user?.id && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDialog({
                            open: true,
                            title: 'Approve Wallet Credit',
                            description: `Add £${selectedFulfillment.prize_value_gbp?.toFixed(2)} to ${selectedFulfillment.user_email}'s wallet?`,
                            confirmText: 'Approve',
                            onConfirm: async () => {
                             
                              setConfirmDialog(prev => ({ ...prev, open: false }))
                              if (user?.id) {
                                await handleApproveCashAlternative(selectedFulfillment.id, user.id)
                              }
                            }
                          })
                        }}
                        disabled={processingId === selectedFulfillment.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                      >
                        {processingId === selectedFulfillment.id ? (
                          <Loader2 className="size-4 mr-2 animate-spin" />
                        ) : (
                          <Wallet className="size-4 mr-2" />
                        )}
                        Approve Wallet Credit
                      </Button>
                    )}

                  {selectedFulfillment.prize_type !== 'Cash' && selectedFulfillment.status === 'dispatched' && (
                    <Button
                      onClick={(e) => {
                       
                        e.stopPropagation()
                        handleUpdateStatus(selectedFulfillment.id, 'delivered')
                      }}
                      disabled={processingId === selectedFulfillment.id}
                      className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                    >
                      {processingId === selectedFulfillment.id ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="size-4 mr-2" />
                      )}
                      Mark Delivered
                    </Button>
                  )}

                  {selectedFulfillment.prize_type !== 'Cash' && selectedFulfillment.status === 'delivered' && (
                    <Button
                      onClick={(e) => {
                      
                        e.stopPropagation()
                        handleUpdateStatus(selectedFulfillment.id, 'completed')
                      }}
                      disabled={processingId === selectedFulfillment.id}
                      className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
                    >
                      {processingId === selectedFulfillment.id ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="size-4 mr-2" />
                      )}
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDialog({ ...confirmDialog, open: false })
              }}
              className="cursor-pointer"
              disabled={confirmDialog.loading}
            >
              Cancel
            </Button>
            <Button
              onClick={async (e) => {
               
                e.stopPropagation()
                setConfirmDialog(prev => ({ ...prev, loading: true }))
                try {
                  await confirmDialog.onConfirm()
                } finally {
                  setConfirmDialog(prev => ({ ...prev, loading: false }))
                }
              }}
              disabled={confirmDialog.loading}
              className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
            >
              {confirmDialog.loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              {confirmDialog.confirmText || 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking Number Dialog */}
      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tracking Number</DialogTitle>
            <DialogDescription>
              Enter the tracking number for this shipment
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={trackingNumberInput}
              onChange={(e) => setTrackingNumberInput(e.target.value)}
              placeholder="Enter tracking number"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-admin-info-fg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trackingNumberInput.trim() && selectedFulfillment) {
                  handleUpdateStatus(selectedFulfillment.id, 'dispatched', trackingNumberInput.trim())
                  setTrackingDialogOpen(false)
                  setTrackingNumberInput('')
                  showSuccessToast('Tracking number added and marked as dispatched')
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setTrackingDialogOpen(false)
                setTrackingNumberInput('')
              }}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={async (e) => {
                e.stopPropagation()
                if (trackingNumberInput.trim() && selectedFulfillment) {
                  setTrackingDialogOpen(false)
                  await handleUpdateStatus(selectedFulfillment.id, 'dispatched', trackingNumberInput.trim())
                  setTrackingNumberInput('')
                  showSuccessToast('Tracking number added and marked as dispatched')
                }
              }}
              disabled={!trackingNumberInput.trim()}
              className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Code Dialog */}
      <Dialog open={voucherDialogOpen} onOpenChange={setVoucherDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide Voucher Code</DialogTitle>
            <DialogDescription>
              Enter the gift card or voucher code and optional instructions
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                Voucher Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={voucherCodeInput}
                onChange={(e) => setVoucherCodeInput(e.target.value)}
                placeholder="Enter voucher code"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-admin-info-fg"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                Instructions (Optional)
              </label>
              <textarea
                value={voucherDescriptionInput}
                onChange={(e) => setVoucherDescriptionInput(e.target.value)}
                placeholder="How to redeem this voucher..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-admin-info-fg resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setVoucherDialogOpen(false)
                setVoucherCodeInput('')
                setVoucherDescriptionInput('')
              }}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={async (e) => {
                e.stopPropagation()
                if (voucherCodeInput.trim() && selectedFulfillment) {
                  setVoucherDialogOpen(false)
                  await handleProvideVoucherCode(
                    selectedFulfillment.id,
                    voucherCodeInput.trim(),
                    voucherDescriptionInput.trim() || undefined
                  )
                  setVoucherCodeInput('')
                  setVoucherDescriptionInput('')
                }
              }}
              disabled={!voucherCodeInput.trim()}
              className="bg-gray-900 hover:bg-gray-800 text-white cursor-pointer disabled:opacity-50"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
