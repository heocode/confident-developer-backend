export function normalizeContactName(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

export function normalizeContactEmail(value) {
  return value.normalize('NFC').trim().toLowerCase()
}

export function normalizeContactMessage(value) {
  return value.normalize('NFC').replace(/\r\n?/gu, '\n').trim()
}
