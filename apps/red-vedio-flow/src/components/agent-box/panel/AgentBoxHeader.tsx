import { Bot, History, Plus, X } from 'lucide-react'
import { AgentBox } from '../AgentBox'
import { selectActiveSession, useAgentBoxStore } from '../agentBoxStore'
import { useCreatePiAgentSessionMutation } from '../piAgentQueries'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AgentBoxHeader() {
  const agents = useAgentBoxStore((state) => state.agents)
  const models = useAgentBoxStore((state) => state.models)
  const selectedAgentId = useAgentBoxStore((state) => state.selectedAgentId)
  const selectedModelId = useAgentBoxStore((state) => state.selectedModelId)
  const activeSession = useAgentBoxStore(selectActiveSession)
  const selectAgent = useAgentBoxStore((state) => state.selectAgent)
  const selectModel = useAgentBoxStore((state) => state.selectModel)
  const createSession = useAgentBoxStore((state) => state.createSession)
  const toggleHistory = useAgentBoxStore((state) => state.toggleHistory)
  const historyOpen = useAgentBoxStore((state) => state.historyOpen)
  const closeDrawer = useAgentBoxStore((state) => state.closeDrawer)
  const createSessionMutation = useCreatePiAgentSessionMutation()
  const messagesById = useAgentBoxStore((state) => state.messagesById)

  const handleCreateSession = () => {
    if(Object.keys(messagesById).length > 0){
       const id = createSession()
       createSessionMutation.mutate({ id })
    }
  }

  return (
    <AgentBox.Header>
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Bot size={18} />
        </div>
        <div className="min-w-0">
          <Select value={selectedAgentId} onValueChange={selectAgent}>
            <SelectTrigger
              className="h-auto w-auto max-w-52 gap-1 border-0 p-0 text-sm font-semibold shadow-none focus:ring-0 focus:ring-offset-0"
              aria-label="选择 Agent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="pointer-events-none invisible h-0 overflow-hidden" aria-hidden="true">
            <Select value={selectedModelId} onValueChange={selectModel}>
              <SelectTrigger
                className="mt-0.5 h-auto w-auto gap-1 border-0 p-0 text-xs text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0"
                aria-label="选择模型"
                tabIndex={-1}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="hidden max-w-28 truncate text-xs text-muted-foreground sm:block">
          {activeSession?.title}
        </span>
        <Button variant="ghost" size="icon" aria-label="新建会话" onClick={handleCreateSession}>
          <Plus size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="会话历史"
          data-active={historyOpen ? '' : undefined}
          onClick={toggleHistory}
        >
          <History size={17} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="关闭" onClick={closeDrawer}>
          <X size={18} />
        </Button>
      </div>
    </AgentBox.Header>
  )
}
