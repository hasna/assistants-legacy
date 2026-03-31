import { describe, it, expect } from 'vitest'

describe('Test framework', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })

  it('supports async', async () => {
    const result = await Promise.resolve('ok')
    expect(result).toBe('ok')
  })
})
