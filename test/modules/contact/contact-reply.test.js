import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { ContactReply } from '../../../src/modules/contact/contact-reply.js'

const inquiryId = new mongoose.Types.ObjectId('68f120000000000000000001')

describe('ContactReply model', () => {
  it('stores immutable private reply content in its own collection', async () => {
    const reply = new ContactReply({
      inquiryId,
      message: 'Thank you for reaching out.',
      commandFingerprint: 'a'.repeat(64),
    })

    await reply.validate()

    assert.equal(ContactReply.collection.collectionName, 'contact_replies')
    assert.equal(ContactReply.schema.path('inquiryId').options.immutable, true)
    assert.equal(ContactReply.schema.path('message').options.select, false)
    assert.equal(ContactReply.schema.path('commandFingerprint').options.select, false)
  })

  it('rejects empty, oversized, and unsafe reply content', async () => {
    for (const message of ['', 'x'.repeat(5_001), 'unsafe\u0000reply']) {
      await assert.rejects(
        new ContactReply({ inquiryId, message, commandFingerprint: 'a'.repeat(64) }).validate(),
        { name: 'ValidationError' },
      )
    }
  })

  it('defines idempotency and deterministic history indexes', () => {
    const indexes = ContactReply.schema.indexes()
    assert.ok(
      indexes.some(
        ([fields, options]) => fields.commandFingerprint === 1 && options.unique === true,
      ),
    )
    assert.ok(
      indexes.some(
        ([fields]) => fields.inquiryId === 1 && fields.createdAt === 1 && fields._id === 1,
      ),
    )
  })
})
