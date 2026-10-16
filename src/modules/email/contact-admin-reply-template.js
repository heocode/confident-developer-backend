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

export function renderContactAdminReply({ inquiry, reply }) {
  const originalSubmittedAt = ownerDateTimeFormatter.format(inquiry.createdAt)
  const originalSubmittedAtIso = inquiry.createdAt.toISOString()
  const text = [
    `Hi ${inquiry.name},`,
    '',
    reply.message,
    '',
    'Your original inquiry:',
    inquiry.message,
    '',
    `Submitted: ${originalSubmittedAt}`,
  ].join('\n')
  const html = [
    '<!doctype html>',
    '<html><body>',
    `<p>Hi ${escapeHtml(inquiry.name)},</p>`,
    `<p>${escapeHtml(reply.message).replaceAll('\n', '<br>')}</p>`,
    '<hr>',
    '<p><strong>Your original inquiry:</strong></p>',
    `<blockquote>${escapeHtml(inquiry.message).replaceAll('\n', '<br>')}</blockquote>`,
    `<p><small>Submitted: <time datetime="${originalSubmittedAtIso}">${escapeHtml(originalSubmittedAt)}</time></small></p>`,
    '</body></html>',
  ].join('')

  return { subject: 'Re: Your portfolio inquiry', text, html }
}
