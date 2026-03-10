import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionMemoryTool } from './SessionMemoryTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { StorageManager } from '@/lib/runtime/StorageManager'
import { PubSub } from '@/lib/pubsub'

vi.mock('@/lib/runtime/StorageManager', () => ({
  StorageManager: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

vi.mock('@/lib/pubsub', () => ({
  PubSub: {
    createMessage: vi.fn(() => ({ type: 'thinking', content: 'test' }))
  }
}))

describe('SessionMemoryTool', () => {
  let tool: SessionMemoryTool
  let mockExecutionContext: Partial<ExecutionContext>

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecutionContext = {
      getPubSub: vi.fn(() => ({
        publishMessage: vi.fn()
      })) as any
    }
    tool = new SessionMemoryTool(mockExecutionContext as ExecutionContext)
    vi.mocked(StorageManager.get).mockResolvedValue({})
    vi.mocked(StorageManager.set).mockResolvedValue(undefined)
  })

  describe('remember action', () => {
    it('should return error when key is missing', async () => {
      const result = await tool.execute({ action: 'remember', value: 'test' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('key is required')
    })

    it('should return error when value is missing', async () => {
      const result = await tool.execute({ action: 'remember', key: 'testKey' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('value is required')
    })

    it('should store a memory successfully', async () => {
      const result = await tool.execute({
        action: 'remember',
        key: 'preferred_language',
        value: 'Spanish',
        category: 'preferences'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('preferred_language')
      expect(result.output).toContain('Spanish')
      expect(StorageManager.set).toHaveBeenCalled()
    })
  })

  describe('recall action', () => {
    it('should return error when key is missing', async () => {
      const result = await tool.execute({ action: 'recall' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('key is required')
    })

    it('should return not-found when key does not exist', async () => {
      vi.mocked(StorageManager.get).mockResolvedValue({})
      const result = await tool.execute({ action: 'recall', key: 'missing_key' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('No memory found')
    })

    it('should recall a stored memory', async () => {
      const mockStore = {
        preferred_language: {
          key: 'preferred_language',
          value: 'Spanish',
          category: 'preferences',
          savedAt: Date.now()
        }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockStore)
      const result = await tool.execute({ action: 'recall', key: 'preferred_language' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('preferred_language')
      expect(result.output).toContain('Spanish')
    })
  })

  describe('recall_all action', () => {
    it('should return empty message when no memories exist', async () => {
      vi.mocked(StorageManager.get).mockResolvedValue({})
      const result = await tool.execute({ action: 'recall_all' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('No memories stored yet')
    })

    it('should list all memories grouped by category', async () => {
      const mockStore = {
        language: { key: 'language', value: 'Spanish', category: 'preferences', savedAt: Date.now() },
        name: { key: 'name', value: 'Alice', category: 'user_info', savedAt: Date.now() }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockStore)
      const result = await tool.execute({ action: 'recall_all' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('PREFERENCES')
      expect(result.output).toContain('Spanish')
      expect(result.output).toContain('USER_INFO')
      expect(result.output).toContain('Alice')
    })
  })

  describe('forget action', () => {
    it('should return error when key is missing', async () => {
      const result = await tool.execute({ action: 'forget' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('key is required')
    })

    it('should forget a stored memory', async () => {
      const mockStore = {
        test_key: { key: 'test_key', value: 'test_val', category: 'general', savedAt: Date.now() }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockStore)
      const result = await tool.execute({ action: 'forget', key: 'test_key' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('test_key')
    })
  })

  describe('forget_all action', () => {
    it('should clear all memories', async () => {
      const result = await tool.execute({ action: 'forget_all' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('cleared')
      expect(StorageManager.set).toHaveBeenCalledWith(expect.any(String), {})
    })
  })
})
