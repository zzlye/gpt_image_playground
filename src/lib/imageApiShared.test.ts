import { describe, expect, it } from 'vitest'

import { GENERIC_QUOTA_ERROR_MESSAGE, getApiErrorMessage, sanitizeApiErrorMessage } from './imageApiShared'

describe('sanitizeApiErrorMessage', () => {
  it('hides NewAPI pre-charge quota details', () => {
    expect(
      sanitizeApiErrorMessage('status_code=403, 预扣费额度失败, 用户剩余额度: 0.016767, 需要预扣费额度: 0.040000'),
    ).toBe(GENERIC_QUOTA_ERROR_MESSAGE)
  })

  it('keeps ordinary API errors unchanged', () => {
    expect(sanitizeApiErrorMessage('Invalid token')).toBe('Invalid token')
  })
})

describe('getApiErrorMessage', () => {
  it('sanitizes quota details from JSON error responses', async () => {
    const response = new Response(JSON.stringify({
      error: {
        message: '预扣费额度失败, 用户剩余额度: 0.016767, 需要预扣费额度: 0.040000',
      },
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(getApiErrorMessage(response)).resolves.toBe(GENERIC_QUOTA_ERROR_MESSAGE)
  })
})
