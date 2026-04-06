import { getEmailLayout } from './layout.ts'

export function getWheelPrizeHTML(name: string, data: Record<string, unknown>, logoUrl?: string): string {
  const prizeLabel = data.prizeLabel as string
  const prizeValue = data.prizeValue as string
  const prizeType = data.prizeType as string
  const prizeAmount = data.prizeAmount as number | undefined
  const promoCode = data.promoCode as string | undefined
  const expiryMinutes = data.expiryMinutes as number | undefined

  let prizeDescription = ''
  let actionButton = ''
  let expiryNote = ''

  if (prizeType === 'discount') {
    prizeDescription = `You've unlocked <strong>${prizeLabel}</strong>! Use the code below at checkout to claim your discount.`
    actionButton = `<a href="${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/competitions" class="button">Start Shopping</a>`
    expiryNote = `This code expires in ${expiryMinutes} minutes.`
  } else if (prizeType === 'credit') {
    prizeDescription = `Congratulations! You've won <strong>${prizeLabel}</strong> to use on BabyBets!`
    actionButton = `<a href="${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/account/wallet" class="button">View My Wallet</a>`
    expiryNote = 'Your credit has been added to your wallet and never expires.'
  } else if (prizeType === 'free_entry') {
    prizeDescription = `Amazing! You've won a <strong>Free Entry</strong> to any competition on BabyBets!`
    actionButton = `<a href="${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/competitions" class="button">Choose Your Competition</a>`
    expiryNote = 'Your free entry is ready to use on any active competition.'
  }

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 80px; height: 80px; margin: 0 auto 16px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; line-height: 1;">
        <span style="font-size: 40px; display: inline-block; line-height: 1; vertical-align: middle;">🎉</span>
      </div>
      <h2 style="margin: 0; font-size: 28px; color: #09090b;">You Won!</h2>
    </div>

    <p>Hi ${name},</p>
    <p>${prizeDescription}</p>

    ${promoCode ? `
    <div class="info-box" style="text-align: center; border: 2px dashed #14b8a6; background-color: #f0fdfa;">
      <div style="font-size: 12px; text-transform: uppercase; color: #14b8a6; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px;">Your Promo Code</div>
      <div style="font-size: 32px; font-weight: 700; color: #0d9488; font-family: 'Courier New', monospace; letter-spacing: 3px;">${promoCode}</div>
      <div style="font-size: 13px; color: #71717a; margin-top: 8px;">Copy this code and apply it at checkout</div>
    </div>
    ` : ''}

    ${prizeType === 'credit' && prizeAmount ? `
    <div class="info-box" style="text-align: center; border: 2px solid #10b981; background-color: #f0fdf4;">
      <div style="font-size: 14px; color: #3f3f46; margin-bottom: 8px;">Credit Added</div>
      <div style="font-size: 36px; font-weight: 700; color: #10b981; letter-spacing: -0.02em;">£${prizeAmount.toFixed(2)}</div>
    </div>
    ` : ''}

    ${actionButton}

    <p style="font-size: 13px; color: #71717a; margin-top: 24px;">
      ${expiryNote}
    </p>

    ${prizeType === 'credit' ? `
    <div style="margin-top: 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #52525b;">
        <strong>Note:</strong> ${name === 'there' ? 'To use your credit, please create an account or log in using this email address.' : 'Your credit has been added to your wallet and is ready to use!'}
      </p>
    </div>
    ` : ''}

    <p style="margin-top: 24px; color: #09090b; font-weight: 600;">Happy Shopping!</p>
    <p style="color: #09090b; font-weight: 600;">The BabyBets Team</p>
  `
  return getEmailLayout('You Won a Prize! 🎉', content, logoUrl)
}

export function getWheelPrizeText(name: string, data: Record<string, unknown>): string {
  const prizeLabel = data.prizeLabel as string
  const prizeValue = data.prizeValue as string
  const prizeType = data.prizeType as string
  const prizeAmount = data.prizeAmount as number | undefined
  const promoCode = data.promoCode as string | undefined
  const expiryMinutes = data.expiryMinutes as number | undefined

  let prizeDescription = ''
  let actionUrl = ''
  let expiryNote = ''

  if (prizeType === 'discount') {
    prizeDescription = `You've unlocked ${prizeLabel}! Use the code below at checkout to claim your discount.`
    actionUrl = `${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/competitions`
    expiryNote = `This code expires in ${expiryMinutes} minutes.`
  } else if (prizeType === 'credit') {
    prizeDescription = `Congratulations! You've won ${prizeLabel} to use on BabyBets!`
    actionUrl = `${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/account/wallet`
    expiryNote = 'Your credit has been added to your wallet and never expires.'
  } else if (prizeType === 'free_entry') {
    prizeDescription = `Amazing! You've won a Free Entry to any competition on BabyBets!`
    actionUrl = `${Deno.env.get('PUBLIC_SITE_URL') || 'https://babybets.co.uk'}/competitions`
    expiryNote = 'Your free entry is ready to use on any active competition.'
  }

  return `
You Won! 🎉

Hi ${name},

${prizeDescription}

${promoCode ? `Your Promo Code: ${promoCode}` : ''}
${prizeType === 'credit' && prizeAmount ? `Credit Added: £${prizeAmount.toFixed(2)}` : ''}

${actionUrl}

${expiryNote}

${prizeType === 'credit' && name === 'there' ? 'Note: To use your credit, please create an account or log in using this email address.' : ''}

Happy Shopping!
The BabyBets Team
  `.trim()
}
