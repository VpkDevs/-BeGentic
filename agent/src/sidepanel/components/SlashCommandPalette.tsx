import React, { useEffect, useRef, useState } from 'react'
import { useAgentsStore } from '@/newtab/stores/agentsStore'
import { ChevronRight, Plus, Bot, FileText, Globe, Search, CheckSquare, BookOpen, Zap } from 'lucide-react'

interface SlashCommandPaletteProps {
  searchQuery: string
  onSelectAgent: (agentId: string) => void
  onSelectBuiltIn?: (command: BuiltInCommand) => void
  onCreateAgent?: () => void
  onClose: () => void
  overlay?: boolean
}

// Built-in slash commands that map to pre-set task prompts
export interface BuiltInCommand {
  id: string
  name: string
  description: string
  prompt: string
  icon: React.ReactNode
}

const BUILT_IN_COMMANDS: BuiltInCommand[] = [
  {
    id: 'summarize',
    name: 'summarize',
    description: 'Summarize the current page',
    prompt: 'Summarize the content of the current page in a concise, structured format.',
    icon: <FileText className="w-4 h-4 text-blue-500" />
  },
  {
    id: 'translate',
    name: 'translate',
    description: 'Translate the current page',
    prompt: 'Translate the current page content to English (or ask me which language you want).',
    icon: <Globe className="w-4 h-4 text-green-500" />
  },
  {
    id: 'fact-check',
    name: 'fact-check',
    description: 'Fact-check claims on this page',
    prompt: 'Fact-check the key claims on the current page and rate their accuracy.',
    icon: <CheckSquare className="w-4 h-4 text-orange-500" />
  },
  {
    id: 'summarize-tabs',
    name: 'summarize-tabs',
    description: 'Summarize all open tabs',
    prompt: 'Summarize all my currently open browser tabs.',
    icon: <Zap className="w-4 h-4 text-purple-500" />
  },
  {
    id: 'reading-list',
    name: 'reading-list',
    description: 'Show my reading list',
    prompt: 'Show my reading list.',
    icon: <BookOpen className="w-4 h-4 text-teal-500" />
  },
  {
    id: 'history',
    name: 'history',
    description: 'Search my browsing history',
    prompt: 'Search my browsing history for: ',
    icon: <Search className="w-4 h-4 text-gray-500" />
  }
]

/**
 * Lightweight slash-commands palette for the sidepanel.
 * Shows built-in commands first, then user-defined agents.
 */
export function SlashCommandPalette({ searchQuery, onSelectAgent, onSelectBuiltIn, onCreateAgent, onClose, overlay = false }: SlashCommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const paletteRef = useRef<HTMLDivElement>(null)
  const { agents } = useAgentsStore()

  // Filter based on search query (after the slash)
  const query = (searchQuery || '').slice(1).toLowerCase()

  const filteredBuiltIn = BUILT_IN_COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().includes(query) ||
    cmd.description.toLowerCase().includes(query)
  )

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(query) ||
    (agent.description || '').toLowerCase().includes(query)
  )

  // Total items = built-in commands + filtered agents + optional create option
  const includeCreate = Boolean(onCreateAgent)
  const totalItems = filteredBuiltIn.length + filteredAgents.length + (includeCreate ? 1 : 0)

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (totalItems > 0) setSelectedIndex(prev => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (totalItems > 0) setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          e.preventDefault()
          handleSelection()
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, totalItems, filteredAgents, filteredBuiltIn])

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSelection = () => {
    if (selectedIndex < filteredBuiltIn.length) {
      // Built-in command selected
      const cmd = filteredBuiltIn[selectedIndex]
      if (onSelectBuiltIn) {
        onSelectBuiltIn(cmd)
      }
    } else {
      const agentIndex = selectedIndex - filteredBuiltIn.length
      if (agentIndex < filteredAgents.length) {
        const agent = filteredAgents[agentIndex]
        onSelectAgent(agent.id)
      } else if (includeCreate && onCreateAgent) {
        onCreateAgent()
      }
    }
  }

  const containerClass = overlay
    ? 'bg-background border border-border rounded-xl shadow-2xl overflow-hidden max-h-[380px] overflow-y-auto'
    : 'absolute bottom-full left-0 right-0 mb-2 bg-background border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-[380px] overflow-y-auto'

  return (
    <div
      ref={paletteRef}
      className={containerClass}
      role="listbox"
      aria-label="Slash command palette"
      style={{ maxHeight: 'min(380px, 60vh)' }}
    >
      <div className="p-2">
        {/* Built-in commands section */}
        {filteredBuiltIn.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground px-3 py-2 font-medium">QUICK COMMANDS</div>
            {filteredBuiltIn.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => { setSelectedIndex(index); handleSelection() }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${selectedIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                role="option"
                aria-selected={selectedIndex === index}
              >
                {cmd.icon}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">/ {cmd.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* User agents section */}
        <div className="text-xs text-muted-foreground px-3 py-2 font-medium mt-1">AGENTS ({filteredAgents.length})</div>
        {filteredAgents.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {agents.length === 0 ? 'Loading agents...' : 'No agents match your search'}
          </div>
        ) : (
        filteredAgents.map((agent, index) => {
          const listIndex = filteredBuiltIn.length + index
          return (
          <button
            key={agent.id}
            onClick={() => { setSelectedIndex(listIndex); handleSelection() }}
            onMouseEnter={() => setSelectedIndex(listIndex)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${selectedIndex === listIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
            role="option"
            aria-selected={selectedIndex === listIndex}
          >
            <Bot className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">/ {agent.name}</div>
              {agent.description && (
                <div className="text-xs text-muted-foreground truncate">{agent.description}</div>
              )}
            </div>
            {agent.isPinned && (
              <div className="text-xs text-muted-foreground">Pinned</div>
            )}
          </button>
          )
        }))}

        {includeCreate && (
          <button
            onClick={() => { setSelectedIndex(filteredBuiltIn.length + filteredAgents.length); handleSelection() }}
            onMouseEnter={() => setSelectedIndex(filteredBuiltIn.length + filteredAgents.length)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${selectedIndex === filteredBuiltIn.length + filteredAgents.length ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-sm">Create/Edit agent</div>
              <div className="text-xs text-muted-foreground">Define a new agent with custom goals and tools</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border bg-muted/30">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  )
}
