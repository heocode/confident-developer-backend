const scopeLabels = Object.freeze({
  'product-design': 'Product design',
  'mobile-app': 'Mobile app',
  'website-web-app': 'Website or web app',
  'backend-api': 'Backend or API',
  'full-product': 'Full product',
  other: 'Other',
})

const budgetLabels = Object.freeze({
  'under-500': 'Under 500',
  '500-1000': '500–1,000',
  '1000-2500': '1,000–2,500',
  '2500-5000': '2,500–5,000',
  'over-5000': 'Over 5,000',
  'not-sure': 'Not sure',
})

const ownerDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderContactOwnerNotification(inquiry) {
  const scopes = inquiry.scopes.map((scope) => scopeLabels[scope] ?? scope).join(', ')
  const budget = budgetLabels[inquiry.budget] ?? inquiry.budget
  const submittedAtIso = inquiry.createdAt.toISOString()
  const submittedAt = ownerDateTimeFormatter.format(inquiry.createdAt)
  const text = [
    'New portfolio contact inquiry',
    '',
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
    `Scope: ${scopes}`,
    `Budget: ${budget}`,
    `Submitted: ${submittedAt}`,
    '',
    'Message:',
    inquiry.message,
    '',
    'Open the administrative inbox to manage and reply to this inquiry.',
  ].join('\n')

  const htmlMessage = escapeHtml(inquiry.message).replaceAll('\n', '<br>')
  const html = [
    '<!doctype html>',
    '<html><body>',
    '<h1>New portfolio contact inquiry</h1>',
    `<p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>`,
    `<p><strong>Scope:</strong> ${escapeHtml(scopes)}</p>`,
    `<p><strong>Budget:</strong> ${escapeHtml(budget)}</p>`,
    `<p><strong>Submitted:</strong> <time datetime="${submittedAtIso}">${escapeHtml(submittedAt)}</time></p>`,
    `<p><strong>Message:</strong><br>${htmlMessage}</p>`,
    '<p>Open the administrative inbox to manage and reply to this inquiry.</p>',
    '</body></html>',
  ].join('')

  return {
    subject: 'New portfolio contact inquiry',
    text,
    html,
  }
}
