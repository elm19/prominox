import { getChatbotContext, getKpiGuideText } from "@/lib/chatbot-context"
import { DOCS_TEXT } from "@/lib/kb/docs"
import { getSnapshot, SOURCES, toolsFor, type SourceId } from "@/lib/kb/tools"

type IncomingMessage = {
  role: "user" | "assistant"
  content: string
}

type Part = { text?: string; functionCall?: { name: string; id?: string; args?: Record<string, unknown> }; functionResponse?: unknown; [key: string]: unknown }
type Content = { role: "user" | "model"; parts: Part[] }

const GEMINI_MODEL = "gemini-3-flash-preview"
const MAX_TOOL_ROUNDS = 6
const MAX_TOOL_RESULT_CHARS = 14000

function parseSources(value: unknown): Set<SourceId> {
  const valid = new Set<string>(SOURCES.map((source) => source.id))
  return new Set((Array.isArray(value) ? value : []).filter((id): id is SourceId => typeof id === "string" && valid.has(id)))
}

function systemPrompt(sources: Set<SourceId>) {
  const lines = [
    "You are the Prominox assistant, built into the Prominox digital-factory website.",
    "Be concise, practical and clear. Use short paragraphs, bullet lists or small tables when they help.",
    "Never invent figures, names or facts. If something is not in your knowledge sources or tool results, say what is missing and, if useful, which knowledge source the user could enable (the book icon in the chat header).",
    "When you quote numbers from a tool, keep their units and say what period or model they come from.",
    "Link to pages with markdown links using these paths: /processes/{id}, /products/{id}, /simulation, /ai-lab, /maintenance, /map, /help/kpis/{slug}.",
  ]
  if (sources.size === 0) {
    lines.push("The user switched the knowledge base off, so you only know the general facts of this prompt. Answer general questions and suggest enabling knowledge sources for factory-specific ones.")
  } else {
    lines.push("You have tools that read live factory data. Prefer calling a tool over guessing; call several tools when a question needs it. Ids come from the list tools or the snapshot below.")
    lines.push(`Enabled knowledge sources: ${SOURCES.filter((s) => sources.has(s.id)).map((s) => s.label).join(", ")}. Not enabled: ${SOURCES.filter((s) => !sources.has(s.id)).map((s) => s.label).join(", ") || "none"}.`)
  }
  return lines.join(" ")
}

async function callGemini(apiKey: string, system: string, contents: Content[], tools: ReturnType<typeof toolsFor>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(tools.length
        ? { tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }] }
        : {}),
    }),
  })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data?.error?.message ?? "Gemini could not answer right now."), { status: response.status })
  return data
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 })
  }

  try {
    const body = (await request.json()) as {
      message?: string
      pathname?: string
      pageEvent?: string
      history?: IncomingMessage[]
      sources?: string[]
    }

    const message = body.message?.trim()
    if (!message) {
      return Response.json({ error: "Please send a question." }, { status: 400 })
    }

    const pathname = body.pathname ?? "/"
    const sources = parseSources(body.sources)
    const history = Array.isArray(body.history) ? body.history.slice(-10) : []
    const tools = toolsFor(sources)

    // Knowledge that is always in the prompt for the enabled sources
    const context: string[] = [`Today is ${new Date().toISOString().slice(0, 10)}.`]
    const [page, snapshot] = await Promise.all([
      sources.has("page") ? getChatbotContext(pathname) : Promise.resolve(""),
      sources.size ? getSnapshot(sources) : Promise.resolve(""),
    ])
    if (page) context.push(`## Where the user is\n${body.pageEvent ?? pathname}\n${page}`)
    if (snapshot) context.push(`## Snapshot of the factory (ids in brackets)\n${snapshot}`)
    if (sources.has("docs")) context.push(`## Knowledge base\n${DOCS_TEXT}\n\n# KPI definitions\n${getKpiGuideText()}`)

    const contents: Content[] = [
      { role: "user", parts: [{ text: context.join("\n\n") }] },
      { role: "model", parts: [{ text: "Understood. I will use this context and my tools to answer." }] },
      ...history.map((item): Content => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
      { role: "user", parts: [{ text: message }] },
    ]

    const used: { tool: string; label: string }[] = []
    const system = systemPrompt(sources)

    for (let round = 0; ; round++) {
      const data = await callGemini(apiKey, system, contents, round >= MAX_TOOL_ROUNDS ? [] : tools)
      const content: Content | undefined = data?.candidates?.[0]?.content
      const calls = (content?.parts ?? []).filter((part) => part.functionCall)

      if (!content || calls.length === 0) {
        const answer = (content?.parts ?? [])
          .map((part) => part.text)
          .filter(Boolean)
          .join("\n")
          .trim()
        return Response.json({ answer: answer || "I could not generate an answer from the available context.", used })
      }

      // Echo the model turn untouched (keeps thought signatures), then answer every call
      contents.push(content)
      const results = await Promise.all(
        calls.map(async (part) => {
          const call = part.functionCall!
          const tool = tools.find((item) => item.name === call.name)
          let output: unknown
          try {
            if (!tool) throw new Error(`Unknown tool ${call.name}`)
            output = await tool.run(call.args ?? {})
          } catch (error) {
            output = { error: error instanceof Error ? error.message : "The lookup failed" }
          }
          if (tool && !used.some((item) => item.tool === tool.name)) used.push({ tool: tool.name, label: tool.label })
          let text = JSON.stringify(output)
          if (text.length > MAX_TOOL_RESULT_CHARS) text = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]`
          return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result: text } } } as Part
        })
      )
      contents.push({ role: "user", parts: results })
    }
  } catch (error) {
    const status = (error as { status?: number }).status
    return Response.json(
      { error: error instanceof Error && status ? error.message : "The assistant request could not be processed." },
      { status: status ?? 500 }
    )
  }
}
