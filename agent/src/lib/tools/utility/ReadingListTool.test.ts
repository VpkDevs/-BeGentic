import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReadingListTool } from './ReadingListTool'
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

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

describe('ReadingListTool', () => {
  let tool: ReadingListTool
  let mockExecutionContext: Partial<ExecutionContext>

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecutionContext = {
      getPubSub: vi.fn(() => ({
        publishMessage: vi.fn()
      })) as any
    }
    tool = new ReadingListTool(mockExecutionContext as ExecutionContext)
    vi.mocked(StorageManager.get).mockResolvedValue([])
    vi.mocked(StorageManager.set).mockResolvedValue(undefined)
  })

  describe('add action', () => {
    it('should return error when url is missing', async () => {
      const result = await tool.execute({ action: 'add', filter: 'unread' })
      expect(result.ok).toBe(false)
      expect(result.output).toContain('url is required')
    })

    it('should add an item to the reading list', async () => {
      const result = await tool.execute({
        action: 'add',
        url: 'https://example.com/article',
        title: 'Interesting Article',
        excerpt: 'A fascinating read about AI.',
        tags: ['ai', 'technology'],
        filter: 'unread'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Interesting Article')
      expect(StorageManager.set).toHaveBeenCalled()
    })

    it('should not add duplicate URLs', async () => {
      const existing = [{
        id: 'existing-1',
        url: 'https://example.com/article',
        title: 'Existing Article',
        excerpt: '',
        tags: [],
        isRead: false,
        savedAt: Date.now(),
        readAt: null
      }]
      vi.mocked(StorageManager.get).mockResolvedValue(existing)
      const result = await tool.execute({
        action: 'add',
        url: 'https://example.com/article',
        filter: 'unread'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Already in reading list')
    })
  })

  describe('list action', () => {
    it('should return empty message when list is empty', async () => {
      const result = await tool.execute({ action: 'list', filter: 'unread' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('No unread items')
    })

    it('should list all items', async () => {
      const items = [
        { id: '1', url: 'https://example.com/a', title: 'Article A', excerpt: '', tags: [], isRead: false, savedAt: Date.now(), readAt: null },
        { id: '2', url: 'https://example.com/b', title: 'Article B', excerpt: '', tags: [], isRead: true, savedAt: Date.now() - 1000, readAt: Date.now() }
      ]
      vi.mocked(StorageManager.get).mockResolvedValue(items)
      const result = await tool.execute({ action: 'list', filter: 'all' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Article A')
      expect(result.output).toContain('Article B')
    })

    it('should filter to unread only', async () => {
      const items = [
        { id: '1', url: 'https://example.com/a', title: 'Unread Article', excerpt: '', tags: [], isRead: false, savedAt: Date.now(), readAt: null },
        { id: '2', url: 'https://example.com/b', title: 'Read Article', excerpt: '', tags: [], isRead: true, savedAt: Date.now() - 1000, readAt: Date.now() }
      ]
      vi.mocked(StorageManager.get).mockResolvedValue(items)
      const result = await tool.execute({ action: 'list', filter: 'unread' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Unread Article')
      expect(result.output).not.toContain('Read Article')
    })
  })

  describe('mark_read action', () => {
    it('should mark an item as read', async () => {
      const items = [{
        id: '1',
        url: 'https://example.com/article',
        title: 'Test Article',
        excerpt: '',
        tags: [],
        isRead: false,
        savedAt: Date.now(),
        readAt: null
      }]
      vi.mocked(StorageManager.get).mockResolvedValue(items)
      const result = await tool.execute({
        action: 'mark_read',
        url: 'https://example.com/article',
        filter: 'unread'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Test Article')
    })
  })

  describe('remove action', () => {
    it('should remove an item from the list', async () => {
      const items = [{
        id: '1',
        url: 'https://example.com/article',
        title: 'Test Article',
        excerpt: '',
        tags: [],
        isRead: false,
        savedAt: Date.now(),
        readAt: null
      }]
      vi.mocked(StorageManager.get).mockResolvedValue(items)
      const result = await tool.execute({
        action: 'remove',
        url: 'https://example.com/article',
        filter: 'unread'
      })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('Removed')
      expect(result.output).toContain('Test Article')
    })
  })

  describe('clear_read action', () => {
    it('should remove all read items', async () => {
      const items = [
        { id: '1', url: 'https://example.com/a', title: 'Unread', excerpt: '', tags: [], isRead: false, savedAt: Date.now(), readAt: null },
        { id: '2', url: 'https://example.com/b', title: 'Read', excerpt: '', tags: [], isRead: true, savedAt: Date.now() - 1000, readAt: Date.now() }
      ]
      vi.mocked(StorageManager.get).mockResolvedValue(items)
      const result = await tool.execute({ action: 'clear_read', filter: 'unread' })
      expect(result.ok).toBe(true)
      expect(result.output).toContain('1 read item')
    })
  })
})
