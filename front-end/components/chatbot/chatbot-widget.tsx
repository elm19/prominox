"use client"

import * as React from "react"
import { BookOpenCheck, Loader2, Maximize2, Minimize2, RotateCcw, Send, X } from "@/lib/icons"
import Image from "next/image"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SOURCES, type SourceId } from "@/lib/kb/sources"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  used?: { tool: string; label: string }[]
}

const SOURCES_KEY = "prominox:chat-sources"
const ALL_SOURCES = SOURCES.map((source) => source.id)

const SUGGESTIONS: { source: SourceId; text: string }[] = [
  { source: "page", text: "Summarise this page for me" },
  { source: "docs", text: "What does this company make, and what can this site do?" },
  { source: "ai", text: "Which machines are most at risk of failing soon?" },
  { source: "ai", text: "Can we produce 50 of each product, and how long would it take?" },
  { source: "factory", text: "Which maintenance work is still pending?" },
  { source: "factory", text: "Are there any unusual sensor readings in the last 24 hours?" },
  { source: "products", text: "Which product has the highest scrap rate?" },
  { source: "docs", text: "How does the failure-risk model work?" },
]

const starterMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "Hi. I can look up live factory data, explain the models and the site, and run what-if simulations. Choose what I may use with the book icon above.",
  },
]

function getPageEvent(pathname: string) {
  const processMatch = pathname.match(/^\/processes\/([^/]+)/)

  if (processMatch?.[1] && processMatch[1] !== "add") {
    return `event:on page:process:${decodeURIComponent(processMatch[1])}`
  }

  if (pathname === "/processes/add") {
    return "event:on page:add-process"
  }

  if (pathname === "/processes") {
    return "event:on page:processes"
  }

  if (pathname === "/maintenance") {
    return "event:on page:maintenance"
  }

  const productMatch = pathname.match(/^\/products\/(\d+)/)

  if (productMatch?.[1]) {
    return `event:on page:product:${productMatch[1]}`
  }

  if (pathname === "/products") {
    return "event:on page:products"
  }

  if (pathname === "/map") {
    return "event:on page:factory-map"
  }

  if (pathname === "/ai-lab") {
    return "event:on page:ai-lab"
  }

  if (pathname.startsWith("/auth")) {
    return `event:on page:${pathname.replace(/^\/+/, "").replaceAll("/", ":")}`
  }

  return pathname === "/" ? "event:on page:dashboard" : `event:on page:${pathname}`
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${match.index}-strong`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">
          {token.slice(1, -1)}
        </code>
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      const href = linkMatch?.[2] ?? "#"

      nodes.push(
        <a
          key={`${match.index}-link`}
          href={href}
          className="font-medium text-primary underline underline-offset-2"
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
        >
          {linkMatch?.[1] ?? token}
        </a>
      )
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n")

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const trimmed = line.trim()

        if (trimmed.startsWith("|")) {
          if (lines[index - 1]?.trim().startsWith("|")) return null // rendered with the first row of its table
          const rows: string[][] = []
          for (let i = index; lines[i]?.trim().startsWith("|"); i++) {
            const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
            if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells)
          }
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {rows.map((cells, r) => (
                    <tr key={r} className={cn("border-b border-border/60", r === 0 && "font-semibold")}>
                      {cells.map((cell, c) => (
                        <td key={c} className="px-2 py-1 align-top">
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (!trimmed) {
          return <div key={index} className="h-1" />
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={index} className="text-sm font-semibold">
              {renderInlineMarkdown(trimmed.slice(4))}
            </h4>
          )
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={index} className="text-sm font-semibold">
              {renderInlineMarkdown(trimmed.slice(3))}
            </h3>
          )
        }

        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={index} className="text-sm font-semibold">
              {renderInlineMarkdown(trimmed.slice(2))}
            </h3>
          )
        }

        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)

        if (bulletMatch) {
          return (
            <div key={index} className="grid grid-cols-[0.65rem_1fr] gap-2">
              <span className="pt-[0.55rem]">
                <span className="block size-1 rounded-full bg-current opacity-60" />
              </span>
              <span>{renderInlineMarkdown(bulletMatch[1])}</span>
            </div>
          )
        }

        const numberMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)

        if (numberMatch) {
          return (
            <div key={index} className="grid grid-cols-[1.25rem_1fr] gap-2">
              <span className="text-xs font-medium text-muted-foreground">{numberMatch[1]}.</span>
              <span>{renderInlineMarkdown(numberMatch[2])}</span>
            </div>
          )
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>
      })}
    </div>
  )
}

export function ChatbotWidget() {
  const pathname = usePathname()
  const pageEvent = React.useMemo(() => getPageEvent(pathname), [pathname])
  const [isOpen, setIsOpen] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState<ChatMessage[]>(starterMessages)
  const [isSending, setIsSending] = React.useState(false)
  const [sources, setSources] = React.useState<SourceId[]>(ALL_SOURCES)
  const [kbOpen, setKbOpen] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(SOURCES_KEY) ?? "null")
      if (Array.isArray(stored)) setSources(stored.filter((id): id is SourceId => ALL_SOURCES.includes(id)))
    } catch {}
  }, [])

  const updateSources = (next: SourceId[]) => {
    setSources(next)
    try {
      window.localStorage.setItem(SOURCES_KEY, JSON.stringify(next))
    } catch {}
  }
  const toggleSource = (id: SourceId) => updateSources(sources.includes(id) ? sources.filter((item) => item !== id) : [...sources, id])

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, isSending])

  const sendMessage = async (preset?: string) => {
    const question = (preset ?? input).trim()

    if (!question || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    }

    setMessages((current) => [...current, userMessage])
    setInput("")
    setIsSending(true)

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          pathname,
          pageEvent,
          history: messages.filter((m) => m.id !== "welcome").slice(-10).map(({ role, content }) => ({ role, content })),
          sources,
        }),
      })

      const data = (await response.json()) as { answer?: string; error?: string; used?: { tool: string; label: string }[] }

      if (!response.ok || !data.answer) {
        throw new Error(data.error ?? "The assistant could not answer right now.")
      }

      const answer = data.answer

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
          used: data.used,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "The assistant could not answer right now.",
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const resetConversation = () => {
    setMessages(starterMessages)
    setInput("")
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <section
          className={cn(
            "flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-foreground/10 sm:w-[390px]",
            isExpanded && "sm:w-[520px]"
          )}
          aria-label="Prominox assistant"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/40 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Image src="/chatbot-icon.png" alt="" width={36} height={36} className="size-9 rounded-lg object-cover" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Prominox assistant</h2>
                <p className="truncate text-xs text-muted-foreground">{pageEvent}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={kbOpen ? "secondary" : "ghost"}
                size="icon-sm"
                className="relative"
                onClick={() => setKbOpen((current) => !current)}
                aria-label="Knowledge sources"
                aria-expanded={kbOpen}
                title="Knowledge sources"
              >
                <BookOpenCheck className="size-4" />
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{sources.length}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={resetConversation}
                aria-label="Reset conversation"
                title="Reset conversation"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="hidden sm:inline-flex"
                onClick={() => setIsExpanded((current) => !current)}
                aria-label={isExpanded ? "Shrink assistant" : "Expand assistant"}
              >
                {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)} aria-label="Close assistant">
                <X className="size-4" />
              </Button>
            </div>
          </header>

          {kbOpen ? (
            <div className="space-y-2 border-b border-border/70 bg-background px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Knowledge base</p>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={sources.length > 0} onChange={(event) => updateSources(event.target.checked ? ALL_SOURCES : [])} className="size-4 accent-[var(--color-primary)]" />
                  {sources.length > 0 ? "On" : "Off"}
                </label>
              </div>
              <ul className="space-y-1.5">
                {SOURCES.map((source) => (
                  <li key={source.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="checkbox" checked={sources.includes(source.id)} onChange={() => toggleSource(source.id)} className="mt-1 size-4 accent-[var(--color-primary)]" />
                      <span>
                        <span className="font-medium">{source.label}</span>
                        <span className="block text-xs leading-4 text-muted-foreground">{source.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Only the sources you tick are read. With everything off, the assistant answers from general knowledge only.</p>
            </div>
          ) : (
            <div className="border-b border-border/70 bg-background px-4 py-2">
              <p className="truncate text-[0.7rem] text-muted-foreground">
                {sources.length ? `Using: ${SOURCES.filter((s) => sources.includes(s.id)).map((s) => s.label).join(", ")}` : "Knowledge base off"}
              </p>
            </div>
          )}

          <div ref={listRef} className="flex h-[420px] flex-col gap-3 overflow-y-auto bg-background/70 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[86%] rounded-xl px-3 py-2 text-sm leading-6",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "border border-border/70 bg-card text-card-foreground"
                )}
              >
                {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : message.content}
                {message.used?.length ? (
                  <p className="mt-2 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">Looked up: {message.used.map((item) => item.label).join(", ")}</p>
                ) : null}
              </div>
            ))}
            {messages.length === 1 && !isSending ? (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.filter((item) => sources.includes(item.source) || sources.length === 0).slice(0, 5).map((item) => (
                  <button
                    key={item.text}
                    type="button"
                    onClick={() => void sendMessage(item.text)}
                    className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            ) : null}
            {isSending ? (
              <div className="flex max-w-[86%] items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Looking things up…
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-border/70 bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder="Ask about the factory, its data or the models…"
                className="max-h-32 min-h-11 resize-none"
                disabled={isSending}
              />
              <Button type="submit" size="icon-lg" disabled={!input.trim() || isSending} aria-label="Send message">
                {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <Button
          type="button"
          size="icon-lg"
          className="size-12 rounded-xl shadow-xl shadow-foreground/15"
          onClick={() => setIsOpen(true)}
          aria-label="Open assistant"
        >
          <Image src="/chatbot-icon.png" alt="" width={48} height={48} className="size-12 rounded-xl object-cover" />
        </Button>
      )}
    </div>
  )
}
