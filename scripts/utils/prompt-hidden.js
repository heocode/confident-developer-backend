import { stdin as defaultInput, stdout as defaultOutput } from 'node:process'

export function promptHidden(question, { input = defaultInput, output = defaultOutput } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('This operation requires an interactive terminal')
  }

  return new Promise((resolve, reject) => {
    let value = ''
    let settled = false
    const previousRawMode = input.isRaw

    const cleanup = () => {
      input.removeListener('data', onData)
      input.setRawMode(previousRawMode)
      input.pause()
      output.write('\n')
    }

    const finish = (callback) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(() => reject(new Error('Operation cancelled')))
          return
        }

        if (character === '\r' || character === '\n') {
          finish(() => resolve(value))
          return
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
        } else if (character >= ' ') {
          value += character
        }
      }
    }

    output.write(question)
    input.setEncoding('utf8')
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}
