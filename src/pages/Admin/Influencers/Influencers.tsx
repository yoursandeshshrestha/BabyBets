import { useState, useCallback, useMemo } from 'react'
import { DashboardHeader } from '../components'
import { CheckCircle, XCircle, ExternalLink, Mail, Instagram, Youtube, UserCheck, Loader, Facebook } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSidebarCounts } from '@/contexts/SidebarCountsContext'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

interface Influencer extends Record<string, unknown> {
  id: string
  user_id: string | null
  email: string | null
  display_name: string
  slug: string
  bio: string | null
  page_bio: string | null
  social_profile_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
  facebook_url: string | null
  profile_image_url: string | null
  page_image_url: string | null
  is_active: boolean | null
  is_ambassador: boolean | null
  commission_tier: number | null
  primary_platform: string | null
  total_followers: string | null
  total_sales_pence: number | null
  total_commission_pence: number | null
  monthly_sales_pence: number | null
  created_at: string | null
  updated_at: string | null
  profiles?: {
    email: string
    first_name: string | null
    last_name: string | null
  } | null
}

export default function Influencers() {
  const [filter, setFilter] = useState<string>('all')
  const [loadingAction, setLoadingAction] = useState<{ id: string; action: 'approve' | 'reject' | 'deactivate' | 'ambassador' } | null>(null)
  const { refreshCounts } = useSidebarCounts()

  // Query builder for infinite scroll
  const queryBuilder = useCallback(() => {
    let query = supabase
      .from('influencers')
      .select(`
        *,
        profiles!influencers_user_id_fkey (
          email,
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      query = query.eq('is_active', false)
    } else if (filter === 'active') {
      query = query.eq('is_active', true)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return query as any
  }, [filter])

  // Use infinite scroll hook
  const {
    data: influencers,
    loading,
    loadingMore,
    hasMore,
    refresh,
    observerRef,
  } = useInfiniteScroll<Influencer>({
    queryBuilder,
    pageSize: 10,
    dependencies: [filter],
  })

  const updateInfluencerStatus = async (id: string, isActive: boolean) => {
    setLoadingAction({ id, action: isActive ? 'approve' : 'deactivate' })
    try {
      // First, get the influencer to find their user_id
      const influencer = influencers.find(i => i.id === id)
      if (!influencer) {
        throw new Error('Influencer not found')
      }

      if (isActive) {
        // Call the approve-influencer-application edge function for ALL approvals
        // (handles both new applications and reactivations, and sends email)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const response = await fetch(`${supabaseUrl}/functions/v1/approve-influencer-application`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ influencerId: id })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to approve application')
        }

        const result = await response.json()
        console.log('Approval result:', result)

        // Check email status and show appropriate message
        let alertMessage = result.message || `Application approved!`

        if (result.emailStatus === 'failed') {
          alertMessage += `\n\n⚠️ Warning: Email notification failed to send.\nError: ${result.emailError || 'Unknown error'}\n\nPlease contact ${influencer.email} manually.`
          console.error('Email sending failed:', result.emailError)
        } else if (result.emailStatus === 'sent') {
          alertMessage += `\n✓ Approval email sent to ${influencer.email}`
        } else {
          alertMessage += `\n\n⚠️ Warning: Email status unknown (${result.emailStatus})`
        }

        alert(alertMessage)
      } else {
        // Deactivating an influencer
        if (!influencer.user_id) {
          throw new Error('Cannot deactivate: influencer has no user account')
        }

        // Update influencer is_active status
        const { error: influencerError } = await supabase
          .from('influencers')
          .update({ is_active: false })
          .eq('id', id)

        if (influencerError) throw influencerError

        // Update user's role back to 'user' in profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: 'user' })
          .eq('id', influencer.user_id)

        if (profileError) throw profileError
      }

      // Reload data
      await refresh()
      // Refresh sidebar counts
      await refreshCounts()
    } catch (error) {
      console.error('Error updating influencer status:', error)
      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoadingAction(null)
    }
  }

  const rejectInfluencer = async (id: string) => {
    if (!confirm('Are you sure you want to reject and delete this application? This action cannot be undone.')) {
      return
    }

    setLoadingAction({ id, action: 'reject' })
    try {
      // Get influencer data before deleting
      const influencer = influencers.find(i => i.id === id)

      // Delete the influencer application
      const { error } = await supabase
        .from('influencers')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Email sent automatically by database trigger on influencer DELETE

      // Reload data
      await refresh()
      // Refresh sidebar counts
      await refreshCounts()
    } catch (error) {
      console.error('Error rejecting influencer:', error)
      alert('Failed to reject application')
    } finally {
      setLoadingAction(null)
    }
  }

  const getCommissionRate = (tier: number) => {
    switch (tier) {
      case 1: return '10%'
      case 2: return '15%'
      case 3: return '20%'
      case 4: return '25%'
      default: return '10%'
    }
  }

  const getNextTierInfo = (monthlySalesPence: number) => {
    if (monthlySalesPence >= 500000) return { tier: 4, needed: 0, label: 'Max Tier' }
    if (monthlySalesPence >= 300000) return { tier: 4, needed: 500000 - monthlySalesPence, label: 'Tier 4' }
    if (monthlySalesPence >= 100000) return { tier: 3, needed: 300000 - monthlySalesPence, label: 'Tier 3' }
    return { tier: 2, needed: 100000 - monthlySalesPence, label: 'Tier 2' }
  }

  const toggleAmbassador = async (id: string, isAmbassador: boolean) => {
    setLoadingAction({ id, action: 'ambassador' })
    try {
      const { error } = await supabase
        .from('influencers')
        .update({ is_ambassador: !isAmbassador })
        .eq('id', id)

      if (error) throw error

      refresh()
    } catch (error) {
      console.error('Error toggling ambassador status:', error)
      alert('Failed to update ambassador status')
    } finally {
      setLoadingAction(null)
    }
  }

  const pendingCount = useMemo(() => influencers.filter(i => !i.is_active).length, [influencers])

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Instagram':
        return <Instagram className="size-4" />
      case 'YouTube':
        return <Youtube className="size-4" />
      case 'TikTok':
        return (
          <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
          </svg>
        )
      case 'Facebook':
        return <Facebook className="size-4" />
      default:
        return <ExternalLink className="size-4" />
    }
  }

  const getStatusBadge = (isActive: boolean | null) => {
    return isActive
      ? 'bg-admin-success-bg text-admin-success-fg'
      : 'bg-admin-warning-bg text-admin-warning-fg'
  }

  return (
    <>
      <DashboardHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Influencers' }]}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Partner Applications</h1>
              <p className="text-muted-foreground mt-1">
                Review and manage influencer partnerships
              </p>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="size-8 text-admin-info-fg" />
            </div>
          </div>

          {/* Filters */}
          <div className="bg-admin-card-bg border border-border rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div className="flex gap-3 items-center">
                <label className="text-sm font-semibold text-muted-foreground">Filter:</label>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Applications</SelectItem>
                    <SelectItem value="pending">
                      Pending Review {pendingCount > 0 && `(${pendingCount})`}
                    </SelectItem>
                    <SelectItem value="active">Active Partners</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-muted text-foreground text-sm font-semibold">
                  {influencers.length} {influencers.length === 1 ? 'application' : 'applications'}
                </span>
              </div>
            </div>
          </div>

          {/* Applications Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block size-12 border-4 border-border border-t-admin-info-fg rounded-full animate-spin"></div>
            </div>
          ) : influencers.length === 0 ? (
            <div className="bg-admin-card-bg border border-border rounded-lg p-12 text-center">
              <UserCheck className="size-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No applications found</h3>
              <p className="text-muted-foreground">
                {filter === 'all' ? 'No applications have been submitted yet.' : `No ${filter} applications.`}
              </p>
            </div>
          ) : (
            <div className="bg-admin-card-bg border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Partner</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Contact</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Platform</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Stats</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Commission</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left py-4 px-6 font-bold text-xs text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {influencers.map((influencer) => (
                      <tr key={influencer.id} className="hover:bg-muted/30 transition-colors">
                        {/* Partner Info */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="font-bold text-sm mb-1">{influencer.display_name}</div>
                              {influencer.slug && (
                                <div className="text-xs text-muted-foreground">/{influencer.slug}</div>
                              )}
                              {influencer.is_ambassador && (
                                <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-admin-info-bg/20 text-admin-info-fg text-xs font-bold mt-1">
                                  ✓ Ambassador
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-4 px-6">
                          {(influencer.email || influencer.profiles?.email) && (
                            <a
                              href={`mailto:${influencer.email || influencer.profiles?.email}`}
                              className="flex items-center gap-1.5 hover:underline text-admin-info-fg cursor-pointer text-sm font-medium mb-1"
                            >
                              <Mail className="size-3.5" />
                              <span className="truncate max-w-[200px]">
                                {influencer.email || influencer.profiles?.email}
                              </span>
                            </a>
                          )}
                          <div className="flex flex-col gap-1">
                            {influencer.instagram_url && (
                              <a
                                href={influencer.instagram_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 hover:underline text-muted-foreground cursor-pointer text-xs"
                              >
                                <Instagram className="size-3" />
                                Instagram
                              </a>
                            )}
                            {influencer.tiktok_url && (
                              <a
                                href={influencer.tiktok_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 hover:underline text-muted-foreground cursor-pointer text-xs"
                              >
                                <svg className="size-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                                </svg>
                                TikTok
                              </a>
                            )}
                            {influencer.facebook_url && (
                              <a
                                href={influencer.facebook_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 hover:underline text-muted-foreground cursor-pointer text-xs"
                              >
                                <Facebook className="size-3" />
                                Facebook
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Platform */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {getPlatformIcon(influencer.primary_platform || 'Instagram')}
                            <span>{influencer.primary_platform}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {influencer.total_followers || 'N/A'} followers
                          </div>
                        </td>

                        {/* Stats */}
                        <td className="py-4 px-6">
                          {influencer.is_active ? (
                            <div className="space-y-1">
                              <div className="text-sm font-bold text-admin-info-fg">
                                £{((influencer.total_sales_pence || 0) / 100).toFixed(0)}
                              </div>
                              <div className="text-xs text-muted-foreground">Total Sales</div>
                              <div className="text-sm font-bold text-admin-success-fg">
                                £{((influencer.total_commission_pence || 0) / 100).toFixed(0)}
                              </div>
                              <div className="text-xs text-muted-foreground">Commission</div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">-</div>
                          )}
                        </td>

                        {/* Commission */}
                        <td className="py-4 px-6">
                          {influencer.is_active ? (
                            <div>
                              <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-admin-info-bg/20 text-admin-info-fg text-xs font-bold mb-1">
                                Tier {influencer.commission_tier || 1}
                              </div>
                              <div className="text-xs text-muted-foreground mb-1">
                                {getCommissionRate(influencer.commission_tier || 1)} commission
                              </div>
                              <div className="text-xs text-muted-foreground">
                                £{((influencer.monthly_sales_pence || 0) / 100).toFixed(0)} this month
                              </div>
                              {(influencer.monthly_sales_pence || 0) < 500000 && (
                                <div className="text-xs text-admin-info-fg mt-1">
                                  £{(getNextTierInfo(influencer.monthly_sales_pence || 0).needed / 100).toFixed(0)} to {getNextTierInfo(influencer.monthly_sales_pence || 0).label}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">-</div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase ${getStatusBadge(influencer.is_active)}`}>
                            {influencer.is_active ? 'ACTIVE' : 'PENDING'}
                          </span>
                          {influencer.is_active && influencer.slug && (
                            <a
                              href={`/partner/${influencer.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-admin-info-fg hover:underline cursor-pointer mt-2"
                            >
                              <ExternalLink className="size-3" />
                              View Profile
                            </a>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            {!influencer.is_active && (
                              <>
                                <button
                                  onClick={() => updateInfluencerStatus(influencer.id, true)}
                                  disabled={loadingAction?.id === influencer.id}
                                  className="flex items-center justify-center gap-2 px-3 py-2 bg-admin-success-bg text-admin-success-fg rounded-lg font-bold text-xs hover:bg-admin-success-fg hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Approve Application"
                                >
                                  {loadingAction?.id === influencer.id && loadingAction.action === 'approve' ? (
                                    <>
                                      <Loader className="size-3.5 animate-spin" />
                                      Approving...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="size-3.5" />
                                      Approve
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => rejectInfluencer(influencer.id)}
                                  disabled={loadingAction?.id === influencer.id}
                                  className="flex items-center justify-center gap-2 px-3 py-2 bg-admin-error-bg text-admin-error-text rounded-lg font-bold text-xs hover:bg-admin-error-text hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Reject Application"
                                >
                                  {loadingAction?.id === influencer.id && loadingAction.action === 'reject' ? (
                                    <>
                                      <Loader className="size-3.5 animate-spin" />
                                      Rejecting...
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="size-3.5" />
                                      Reject
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                            {influencer.is_active && (
                              <>
                                <button
                                  onClick={() => toggleAmbassador(influencer.id, influencer.is_ambassador || false)}
                                  disabled={loadingAction?.id === influencer.id}
                                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                    influencer.is_ambassador
                                      ? 'bg-admin-info-fg text-white'
                                      : 'bg-admin-card-bg border border-border text-foreground hover:bg-muted'
                                  }`}
                                  title={influencer.is_ambassador ? 'Remove Ambassador Status' : 'Make Ambassador'}
                                >
                                  {loadingAction?.id === influencer.id && loadingAction.action === 'ambassador' ? (
                                    <>
                                      <Loader className="size-3.5 animate-spin" />
                                      Updating...
                                    </>
                                  ) : (
                                    influencer.is_ambassador ? '✓ Ambassador' : 'Ambassador'
                                  )}
                                </button>
                                <button
                                  onClick={() => updateInfluencerStatus(influencer.id, false)}
                                  disabled={loadingAction?.id === influencer.id}
                                  className="flex items-center justify-center gap-2 px-3 py-2 bg-admin-warning-bg text-admin-warning-fg rounded-lg font-bold text-xs hover:bg-admin-warning-fg hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Deactivate Partner"
                                >
                                  {loadingAction?.id === influencer.id && loadingAction.action === 'deactivate' ? (
                                    <>
                                      <Loader className="size-3.5 animate-spin" />
                                      Deactivating...
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="size-3.5" />
                                      Deactivate
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
              {!hasMore && influencers.length > 0 && (
                <div className="p-4 text-center">
                  <span className="text-sm text-muted-foreground">
                    All applications loaded ({influencers.length} total)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
