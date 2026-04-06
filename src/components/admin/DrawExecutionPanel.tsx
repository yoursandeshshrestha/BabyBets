import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, AlertTriangle, CheckCircle, XCircle, Loader, Shield, Hash, User, Ticket, Sparkles } from 'lucide-react'
import { useDraws } from '@/hooks/useDraws'
import type { Competition, Draw, DrawExecutionResult } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'

interface DrawExecutionPanelProps {
  competition: Competition
  onDrawExecuted?: () => void
}

export function DrawExecutionPanel({ competition, onDrawExecuted }: DrawExecutionPanelProps) {
  const { executeDraw, isExecutingDraw, verifyDraw, isVerifyingDraw, getDrawByCompetitionId } = useDraws()
  const [existingDraw, setExistingDraw] = useState<Draw | null>(null)
  const [drawResult, setDrawResult] = useState<DrawExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showDrawAnimation, setShowDrawAnimation] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'scanning' | 'selecting' | 'winner'>('scanning')
  const [scanningTickets, setScanningTickets] = useState<number[]>([])
  const [finalWinner, setFinalWinner] = useState<DrawExecutionResult | null>(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [verificationResult, setVerificationResult] = useState<Awaited<ReturnType<typeof verifyDraw>> | null>(null)

  useEffect(() => {
    loadExistingDraw()
  }, [competition.id])


  const loadExistingDraw = async () => {
    try {
      const draw = await getDrawByCompetitionId(competition.id)
      setExistingDraw(draw)
    } catch (err) {
      console.error('Error loading draw:', err)
    }
  }

  const handleExecuteDraw = async () => {
    setError(null)
    setDrawResult(null)
    setShowConfirmModal(false)
    setShowDrawAnimation(true)
    setAnimationPhase('scanning')

    // Generate random ticket numbers for animation
    const ticketNumbers = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * (competition.tickets_sold ?? 0)) + 1
    )
    setScanningTickets(ticketNumbers)

    try {
      // Phase 1: Scanning animation (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000))
      setAnimationPhase('selecting')

      // Execute the actual draw
      const result = await executeDraw(competition.id)

      // Email will be sent automatically by auto-execute-draws Edge Function

      // Phase 2: Selecting animation (1.5 seconds)
      await new Promise(resolve => setTimeout(resolve, 1500))
      setAnimationPhase('winner')
      setFinalWinner(result)
      setDrawResult(result)

      // Phase 3: Show winner (user must click to close)
      // Don't call onDrawExecuted or reload draw details here
      // They will be called when the user closes the modal
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute draw'
      setError(errorMessage)
      setShowDrawAnimation(false)
      console.error('Error executing draw:', err)
    }
  }

  const handleCloseDrawAnimation = async () => {
    setShowDrawAnimation(false)
    setAnimationPhase('scanning')
    setFinalWinner(null)

    // Reload the draw details and notify parent after closing the modal
    await loadExistingDraw()
    if (onDrawExecuted) {
      onDrawExecuted()
    }
  }

  const handleVerifyDraw = async () => {
    if (!existingDraw) return

    try {
      const result = await verifyDraw(existingDraw.id)
      setVerificationResult(result)
      setShowVerificationModal(true)
    } catch (err) {
      console.error('Error verifying draw:', err)
      setError('Failed to verify draw')
    }
  }

  // Check if competition is eligible for draw
  const isEligibleForDraw = () => {
    if (existingDraw) return false // Already drawn
    if (!competition.status || !['closed', 'active'].includes(competition.status)) return false
    if (competition.tickets_sold === 0) return false
    return true
  }

  const canExecuteDraw = isEligibleForDraw()

  // If draw already exists, show draw results
  if (existingDraw) {
    return (
      <>
        <div className="bg-admin-card-bg rounded-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="size-5 text-admin-success-fg" />
              Draw Completed
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Executed on {new Date(existingDraw.executed_at).toLocaleString('en-GB')}
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-admin-success-bg text-admin-success-fg">
            Completed
          </span>
        </div>

        <div className="space-y-4">
          {/* Winner Info */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <User className="size-4" />
              Winner Information
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">User ID:</span>
                <p className="font-mono font-medium mt-1">{existingDraw.winning_user_id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Ticket ID:</span>
                <p className="font-mono font-medium mt-1">{existingDraw.winning_ticket_id}</p>
              </div>
            </div>
          </div>

          {/* Draw Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Ticket className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Winner Index</span>
              </div>
              <p className="text-xl font-bold text-foreground">{existingDraw.winner_index}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Hash className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Random Source</span>
              </div>
              <p className="text-sm font-mono text-foreground">{existingDraw.random_source}</p>
            </div>
          </div>

          {/* Verification Hash */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="size-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">Verification Hash</h4>
            </div>
            <p className="text-xs font-mono text-muted-foreground break-all bg-admin-hover-bg p-3 rounded-lg">
              {existingDraw.verification_hash}
            </p>
          </div>

          {/* Verify Button */}
          <button
            onClick={handleVerifyDraw}
            disabled={isVerifyingDraw}
            className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-admin-info-fg hover:bg-admin-info-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isVerifyingDraw ? (
              <>
                <Loader className="size-5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="size-5" />
                Verify Draw Integrity
              </>
            )}
          </button>
        </div>
      </div>

      {/* Verification Result Modal */}
      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 border-border">
          {verificationResult && (
            <>
              {/* Fixed Header */}
              <DialogHeader className="shrink-0 px-6 py-4 border-b border-border">
                {(() => {
                  const allChecksPassed =
                    verificationResult.verification_checks.snapshot_hash_valid &&
                    verificationResult.verification_checks.verification_hash_valid &&
                    verificationResult.verification_checks.winner_index_valid

                  return allChecksPassed ? (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="size-6 text-admin-success-fg" />
                      <div>
                        <DialogTitle className="text-lg">Draw Verified</DialogTitle>
                        <DialogDescription>All checks passed</DialogDescription>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <XCircle className="size-6 text-admin-error-text" />
                      <div>
                        <DialogTitle className="text-lg">Verification Failed</DialogTitle>
                        <DialogDescription>One or more checks failed</DialogDescription>
                      </div>
                    </div>
                  )
                })()}
              </DialogHeader>

              {/* Scrollable Content */}
              <ScrollArea className="flex-1 px-6">
                <div className="py-4 space-y-4">
                  {/* Verification Checks */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Verification Checks
                    </h4>
                    <div className="space-y-2">
                      {/* Snapshot Hash Check */}
                      <div className={`flex items-center justify-between p-3 rounded border ${
                        verificationResult.verification_checks.snapshot_hash_valid
                          ? 'bg-admin-success-bg border-admin-success-fg'
                          : 'bg-admin-error-bg border-admin-error-border'
                      }`}>
                        <div className="flex items-center gap-2">
                          {verificationResult.verification_checks.snapshot_hash_valid ? (
                            <CheckCircle className="size-4 text-admin-success-fg" />
                          ) : (
                            <XCircle className="size-4 text-admin-error-text" />
                          )}
                          <span className="text-sm font-medium text-foreground">Snapshot Hash</span>
                        </div>
                        <span className={`text-xs font-bold ${
                          verificationResult.verification_checks.snapshot_hash_valid
                            ? 'text-admin-success-fg'
                            : 'text-admin-error-text'
                        }`}>
                          {verificationResult.verification_checks.snapshot_hash_valid ? 'VALID' : 'INVALID'}
                        </span>
                      </div>

                      {/* Verification Hash Check */}
                      <div className={`flex items-center justify-between p-3 rounded border ${
                        verificationResult.verification_checks.verification_hash_valid
                          ? 'bg-admin-success-bg border-admin-success-fg'
                          : 'bg-admin-error-bg border-admin-error-border'
                      }`}>
                        <div className="flex items-center gap-2">
                          {verificationResult.verification_checks.verification_hash_valid ? (
                            <CheckCircle className="size-4 text-admin-success-fg" />
                          ) : (
                            <XCircle className="size-4 text-admin-error-text" />
                          )}
                          <span className="text-sm font-medium text-foreground">Verification Hash</span>
                        </div>
                        <span className={`text-xs font-bold ${
                          verificationResult.verification_checks.verification_hash_valid
                            ? 'text-admin-success-fg'
                            : 'text-admin-error-text'
                        }`}>
                          {verificationResult.verification_checks.verification_hash_valid ? 'VALID' : 'INVALID'}
                        </span>
                      </div>

                      {/* Winner Index Check */}
                      <div className={`flex items-center justify-between p-3 rounded border ${
                        verificationResult.verification_checks.winner_index_valid
                          ? 'bg-admin-success-bg border-admin-success-fg'
                          : 'bg-admin-error-bg border-admin-error-border'
                      }`}>
                        <div className="flex items-center gap-2">
                          {verificationResult.verification_checks.winner_index_valid ? (
                            <CheckCircle className="size-4 text-admin-success-fg" />
                          ) : (
                            <XCircle className="size-4 text-admin-error-text" />
                          )}
                          <span className="text-sm font-medium text-foreground">Winner Index</span>
                        </div>
                        <span className={`text-xs font-bold ${
                          verificationResult.verification_checks.winner_index_valid
                            ? 'text-admin-success-fg'
                            : 'text-admin-error-text'
                        }`}>
                          {verificationResult.verification_checks.winner_index_valid ? 'VALID' : 'INVALID'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Draw Details */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Draw Details
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs text-muted-foreground">Total Entries</p>
                        <p className="text-sm font-semibold text-foreground">{verificationResult.draw_details.total_entries}</p>
                      </div>
                      <div className="p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs text-muted-foreground">Winner Index</p>
                        <p className="text-sm font-semibold text-foreground">{verificationResult.draw_details.winner_index}</p>
                      </div>
                      <div className="col-span-2 p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs text-muted-foreground">Executed At</p>
                        <p className="text-xs font-medium text-foreground">
                          {new Date(verificationResult.draw_details.executed_at).toLocaleString('en-GB')}
                        </p>
                      </div>
                      <div className="col-span-2 p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs text-muted-foreground mb-1">Random Seed</p>
                        <p className="text-[10px] font-mono text-foreground break-all leading-tight">{verificationResult.draw_details.random_seed}</p>
                      </div>
                    </div>
                  </div>

                  {/* Hash Comparison */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Hash Comparison
                    </h4>
                    <div className="space-y-2">
                      {/* Snapshot Hash */}
                      <div className="p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs font-medium text-foreground mb-1">Snapshot Hash</p>
                        <div className="space-y-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Stored</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.stored_snapshot_hash}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Recomputed</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.recomputed_snapshot_hash}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Verification Hash */}
                      <div className="p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs font-medium text-foreground mb-1">Verification Hash</p>
                        <div className="space-y-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Stored</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.stored_verification_hash}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Recomputed</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.recomputed_verification_hash}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Winner Ticket ID */}
                      <div className="p-2 bg-admin-hover-bg rounded">
                        <p className="text-xs font-medium text-foreground mb-1">Winner Ticket ID</p>
                        <div className="space-y-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Expected</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.expected_winner_ticket_id}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Actual</p>
                            <p className="text-[10px] font-mono text-foreground break-all leading-tight">
                              {verificationResult.computed_values.actual_winner_ticket_id}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Fixed Footer */}
              <div className="shrink-0 px-6 py-4 border-t border-border">
                <Button
                  onClick={() => {
                    setShowVerificationModal(false)
                    setVerificationResult(null)
                  }}
                  className="w-full cursor-pointer"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      </>
    )
  }

  // Show draw execution panel
  return (
    <>
      <div className="bg-admin-card-bg rounded-lg p-6 border border-border">
        <div className="mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="size-5" />
            Main Prize Draw
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Execute the cryptographically secure prize draw
          </p>
        </div>

        {/* Eligibility Status */}
        <div className="mb-6">
          {canExecuteDraw ? (
            <div className="p-4 bg-admin-hover-bg rounded-lg border border-border flex items-start gap-3">
              <CheckCircle className="size-5 text-admin-success-fg shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Ready to Execute</p>
                <p className="text-sm text-muted-foreground">
                  This competition has {competition.tickets_sold} tickets sold and is ready for the draw.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-admin-hover-bg rounded-lg border border-border flex items-start gap-3">
              <AlertTriangle className="size-5 text-admin-orange-fg shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Not Eligible</p>
                <p className="text-sm text-muted-foreground">
                  {competition.tickets_sold === 0
                    ? 'No tickets have been sold yet.'
                    : `Competition status must be "closed" or "active". Current status: ${competition.status}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Draw Info */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Total Tickets Sold</span>
            <span className="font-semibold text-foreground">{competition.tickets_sold}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Competition Status</span>
            <span className="font-semibold text-foreground capitalize">{competition.status}</span>
          </div>
          {competition.draw_datetime && (
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Scheduled Draw Time</span>
              <span className="font-semibold text-foreground">
                {new Date(competition.draw_datetime).toLocaleString('en-GB')}
              </span>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-admin-error-bg rounded-lg border border-admin-error-border flex items-start gap-3">
            <XCircle className="size-5 text-admin-error-text shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Error</p>
              <p className="text-sm text-admin-error-text">{error}</p>
            </div>
          </div>
        )}

        {/* Success Display */}
        {drawResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 p-4 bg-admin-success-bg rounded-lg border border-admin-success-fg"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="size-5 text-admin-success-fg shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-foreground mb-2">Draw Executed Successfully!</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Winner: {drawResult.winner_display_name}</p>
                  <p>Ticket: #{drawResult.winning_ticket_number}</p>
                  <p>Index: {drawResult.winner_index} of {drawResult.total_entries}</p>
                  <p className="font-mono text-xs break-all">Hash: {drawResult.verification_hash}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Execute Button */}
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={!canExecuteDraw || isExecutingDraw}
          className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-admin-info-fg hover:bg-admin-info-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {isExecutingDraw ? (
            <>
              <Loader className="size-5 animate-spin" />
              Executing Draw...
            </>
          ) : (
            <>
              <Trophy className="size-5" />
              Execute Draw
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          This action will use cryptographically secure randomness to select a winner
        </p>
      </div>

      {/* Confirmation Modal */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-admin-orange-fg" />
              Confirm Draw Execution
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to execute the draw for this competition? This action cannot be undone
              and will:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>Lock the competition (status → "drawing")</li>
            <li>Create a deterministic snapshot of all tickets</li>
            <li>Generate a cryptographically secure random seed</li>
            <li>Select a winner using verifiable randomness</li>
            <li>Create an immutable audit trail</li>
            <li>Update competition status to "drawn"</li>
          </ul>

          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteDraw}
              disabled={isExecutingDraw}
              className="cursor-pointer"
            >
              {isExecutingDraw ? 'Executing...' : 'Execute Draw'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Draw Animation Modal */}
      <Dialog open={showDrawAnimation} onOpenChange={(open) => !open && handleCloseDrawAnimation()}>
        <DialogContent className="max-w-lg flex flex-col p-0 border-border">
          <AnimatePresence mode="wait">
            {/* Scanning Phase */}
            {animationPhase === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col"
              >
                <DialogHeader className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader className="size-6 text-admin-info-fg" />
                    </motion.div>
                    <div>
                      <DialogTitle className="text-lg">Scanning Tickets</DialogTitle>
                      <DialogDescription>
                        Analyzing {(competition.tickets_sold ?? 0).toLocaleString()} entries
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="px-6 py-8">
                  <div className="grid grid-cols-5 gap-2">
                    {scanningTickets.slice(0, 10).map((num, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: [0, 1, 0], y: 0 }}
                        transition={{ duration: 0.8, delay: i * 0.1, repeat: Infinity }}
                        className="bg-admin-hover-bg rounded-md py-2 px-1 text-center text-sm font-mono font-medium text-foreground"
                      >
                        #{num}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Selecting Phase */}
            {animationPhase === 'selecting' && (
              <motion.div
                key="selecting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col"
              >
                <DialogHeader className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <Sparkles className="size-6 text-admin-purple-fg" />
                    </motion.div>
                    <div>
                      <DialogTitle className="text-lg">Selecting Winner</DialogTitle>
                      <DialogDescription>
                        Using cryptographically secure randomness
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="px-6 py-12 flex justify-center">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                        className="w-3 h-3 bg-admin-purple-fg rounded-full"
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Winner Phase */}
            {animationPhase === 'winner' && (
              <motion.div
                key="winner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col"
              >
                <DialogHeader className="px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Trophy className="size-6 text-admin-success-fg" />
                    <div>
                      <DialogTitle className="text-lg">Winner Selected</DialogTitle>
                      <DialogDescription>
                        Draw completed successfully
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="px-6 py-6">
                  <div className="space-y-4">
                    <div className="bg-admin-hover-bg rounded-lg p-4">
                      <p className="text-xs text-muted-foreground mb-1">Winner Name</p>
                      <p className="text-xl font-semibold text-foreground">
                        {finalWinner?.winner_display_name || 'Loading...'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-admin-hover-bg rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">Ticket Number</p>
                        <p className="text-lg font-mono font-semibold text-foreground">
                          #{finalWinner?.winning_ticket_number || '-'}
                        </p>
                      </div>
                      <div className="bg-admin-hover-bg rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">Winner Index</p>
                        <p className="text-lg font-mono font-semibold text-foreground">
                          {finalWinner?.winner_index ?? '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-border">
                  <Button
                    onClick={handleCloseDrawAnimation}
                    className="w-full cursor-pointer"
                  >
                    Continue
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  )
}
