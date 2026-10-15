import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { renderContactOwnerNotification } from '../../../src/modules/email/contact-owner-notification-template.js'

describe('contact owner notification template', () => {
  it('renders readable text and escapes every user-controlled HTML value', () => {
    const content = renderContactOwnerNotification({
      name: 'A <B> & "C"',
      email: 'person@example.com',
      message: "Build <script>alert('x')</script> & ship\nSecond line",
      scopes: ['product-design', 'backend-api'],
      budget: '1000-2500',
      createdAt: new Date('2026-10-15T18:00:00.000Z'),
    })

    assert.equal(content.subject, 'New portfolio contact inquiry')
    assert.match(content.text, /Name: A <B> & "C"/)
    assert.match(content.text, /Scope: Product design, Backend or API/)
    assert.match(content.text, /Budget: 1,000–2,500/)
    assert.match(content.text, /Submitted: October 15, 2026 at 2:00 PM EDT/)
    assert.match(content.html, /A &lt;B&gt; &amp; &quot;C&quot;/)
    assert.match(
      content.html,
      /<time datetime="2026-10-15T18:00:00.000Z">October 15, 2026 at 2:00 PM EDT<\/time>/,
    )
    assert.match(content.html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; ship<br>Second line/)
    assert.doesNotMatch(content.html, /<script>/)
  })

  it('uses the Toronto daylight-saving offset for the submitted time', () => {
    const content = renderContactOwnerNotification({
      name: 'Winter Test',
      email: 'person@example.com',
      message: 'A sufficiently long notification test message.',
      scopes: ['other'],
      budget: 'not-sure',
      createdAt: new Date('2026-01-15T18:00:00.000Z'),
    })

    assert.match(content.text, /Submitted: January 15, 2026 at 1:00 PM EST/)
  })
})
