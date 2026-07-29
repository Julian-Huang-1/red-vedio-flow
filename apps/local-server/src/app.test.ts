import { describe, expect, it } from 'vitest'
import { isAllowedOrigin } from './app'

describe('local-server origin policy', () => {
  it('allows standalone file applications and loopback web applications', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('null')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:4173')).toBe(true)
    expect(isAllowedOrigin('http://localhost:4173')).toBe(true)
  })

  it('rejects non-loopback web origins', () => {
    expect(isAllowedOrigin('https://example.com')).toBe(false)
  })
})
