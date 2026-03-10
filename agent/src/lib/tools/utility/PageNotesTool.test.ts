import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PageNotesTool } from './PageNotesTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { StorageManager } from '@/lib/runtime/StorageManager'
import { PubSub } from '@/lib/pubsub'

// Mock StorageManager
vi.mock('@/lib/runtime/StorageManager', () => ({
  StorageManager: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

// Mock PubSub
vi.mock('@/lib/pubsub', () => ({
  PubSub: {
    createMessage: vi.fn(() => ({ type: 'thinking', content: 'test' }))
  }
}))

describe('PageNotesTool', () => {
  let tool: PageNotesTool
  let mockExecutionContext: Partial<ExecutionContext>

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecutionContext = {
      getPubSub: vi.fn(() => ({
        publishMessage: vi.fn()
      })) as any
    }
    tool = new PageNotesTool(mockExecutionContext as ExecutionContext)
    vi.mocked(StorageManager.get).mockResolvedValue({})
    vi.mocked(StorageManager.set).mockResolvedValue(undefined)
  })

  describe('save action', () => {
    it('should return error when url is missing', async () => {
      const result = await tool.execute({ action: 'save', note: 'Test note' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('url is required')
    })

    it('should return error when note is missing', async () => {
      const result = await tool.execute({ action: 'save', url: 'https://example.com' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('note is required')
    })

    it('should save a note successfully', async () => {
      const result = await tool.execute({
        action: 'save',
        url: 'https://example.com/article',
        title: 'Test Article',
        note: 'This is my note about this article.'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Test Article')
      expect(StorageManager.set).toHaveBeenCalled()
    })
  })

  describe('get action', () => {
    it('should return error when url is missing', async () => {
      const result = await tool.execute({ action: 'get' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('url is required')
    })

    it('should return not-found message when no note exists', async () => {
      vi.mocked(StorageManager.get).mockResolvedValue({})
      const result = await tool.execute({
        action: 'get',
        url: 'https://example.com/missing'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('No note found')
    })

    it('should return the note when it exists', async () => {
      const mockNotes = {
        'https://example.com/article': {
          url: 'https://example.com/article',
          title: 'Test Article',
          note: 'My important note',
          savedAt: Date.now()
        }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockNotes)
      const result = await tool.execute({
        action: 'get',
        url: 'https://example.com/article'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('My important note')
      expect(result.output).toContain('Test Article')
    })
  })

  describe('list action', () => {
    it('should return empty message when no notes exist', async () => {
      vi.mocked(StorageManager.get).mockResolvedValue({})
      const result = await tool.execute({ action: 'list' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('No page notes saved yet')
    })

    it('should list saved notes sorted by date', async () => {
      const now = Date.now()
      const mockNotes = {
        'https://example.com/page1': {
          url: 'https://example.com/page1',
          title: 'Older Article',
          note: 'Old note',
          savedAt: now - 10000
        },
        'https://example.com/page2': {
          url: 'https://example.com/page2',
          title: 'Newer Article',
          note: 'New note',
          savedAt: now
        }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockNotes)
      const result = await tool.execute({ action: 'list' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Saved Page Notes (2)')
      expect(result.output).toContain('Newer Article')
      expect(result.output).toContain('Older Article')
    })
  })

  describe('delete action', () => {
    it('should return error when url is missing', async () => {
      const result = await tool.execute({ action: 'delete' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('url is required')
    })

    it('should delete an existing note', async () => {
      const mockNotes = {
        'https://example.com/article': {
          url: 'https://example.com/article',
          title: 'Test Article',
          note: 'My note',
          savedAt: Date.now()
        }
      }
      vi.mocked(StorageManager.get).mockResolvedValue(mockNotes)
      const result = await tool.execute({
        action: 'delete',
        url: 'https://example.com/article'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Test Article')
      expect(StorageManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({ 'https://example.com/article': expect.anything() })
      )
    })
  })
})
