import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { renderContactAdminReply } from '../../../src/modules/email/contact-admin-reply-template.js'

describe('contact admin reply template', () => {
  it('renders readable reply context and escapes both messages', () => {
    const content = renderContactAdminReply({
      inquiry: {
        name: 'A <B>',
        message: '<script>original</script>',
        createdAt: new Date('2026-10-15T18:00:00.000Z'),
      },
      reply: { message: 'Thanks & welcome\nNext line' },
    })

    assert.equal(content.subject, 'Re: Your portfolio inquiry')
    assert.match(content.text, /Submitted: October 15, 2026 at 2:00 PM EDT/)
    assert.match(content.html, /Hi A &lt;B&gt;/)
    assert.match(content.html, /Thanks &amp; welcome<br>Next line/)
    assert.match(content.html, /&lt;script&gt;original&lt;\/script&gt;/)
    assert.doesNotMatch(content.html, /<script>/)
  })
})
