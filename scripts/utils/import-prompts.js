import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

import { promptHidden } from './prompt-hidden.js'

export function requireInteractiveTerminal(operation) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(`${operation} requires an interactive terminal`)
  }
}

export async function ask(question) {
  const prompts = createInterface({ input, output })
  try {
    return (await prompts.question(question)).trim()
  } finally {
    prompts.close()
  }
}

export async function confirm(question) {
  return (await ask(`${question} [y/N] `)).toLowerCase() === 'y'
}

export async function readAdminCredentials() {
  const email = (await ask('Admin email: ')).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('A valid admin email is required')
  }

  const password = await promptHidden('Admin password: ')
  if (!password) throw new Error('Admin password is required')
  return { email, password }
}
