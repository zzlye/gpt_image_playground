import { describe, expect, it } from 'vitest'
import { parseModelListPayload } from './modelList'

describe('parseModelListPayload', () => {
  it('reads standard OpenAI compatible model data', () => {
    expect(parseModelListPayload({ data: [{ id: 'gpt-5.5' }, { id: 'grok-imagine-video' }] })).toEqual([
      'gpt-5.5',
      'grok-imagine-video',
    ])
  })

  it('reads nested NewAPI style model lists and json encoded lists', () => {
    expect(parseModelListPayload({
      success: true,
      data: {
        models: JSON.stringify([
          { model_name: 'text-model-a' },
          { name: 'video-model-b' },
        ]),
      },
    })).toEqual(['text-model-a', 'video-model-b'])
  })
})
