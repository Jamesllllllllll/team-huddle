import { useMemo } from 'react'

type MarkdownRendererProps = {
    content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
    const rendered = useMemo(() => {
        const lines = content.split('\n')
        const elements: React.JSX.Element[] = []
        let key = 0

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const trimmed = line.trim()

            // Empty line
            if (trimmed === '') {
                elements.push(<br key={key++} />)
                continue
            }

            // Headings
            if (trimmed.startsWith('# ')) {
                elements.push(
                    <h1 key={key++} className="text-3xl font-bold mt-4 mb-3 text-slate-900 dark:text-slate-100">
                        {parseInlineMarkdown(trimmed.slice(2))}
                    </h1>
                )
                continue
            }
            if (trimmed.startsWith('## ')) {
                elements.push(
                    <h2 key={key++} className="text-2xl font-semibold mt-3 mb-1 text-slate-900 dark:text-slate-100">
                        {parseInlineMarkdown(trimmed.slice(3))}
                    </h2>
                )
                continue
            }
            if (trimmed.startsWith('### ')) {
                elements.push(
                    <h3 key={key++} className="text-xl font-semibold mt-2 mb-0.5 text-slate-900 dark:text-slate-100">
                        {parseInlineMarkdown(trimmed.slice(4))}
                    </h3>
                )
                continue
            }

            // Unordered lists
            if (trimmed.startsWith('- ')) {
                const listItems: React.JSX.Element[] = []
                let j = i
                while (j < lines.length && lines[j].trim().startsWith('- ')) {
                    const itemText = lines[j].trim().slice(2)
                    listItems.push(
                        <li key={j} className="ml-4 mb-1 text-slate-800 dark:text-slate-200">
                            {parseInlineMarkdown(itemText)}
                        </li>
                    )
                    j++
                }
                elements.push(
                    <ul key={key++} className="list-disc mb-3 ml-6">
                        {listItems}
                    </ul>
                )
                i = j - 1
                continue
            }

            // Regular paragraph
            elements.push(
                <p key={key++} className="mb-0 text-slate-800 dark:text-slate-200 leading-relaxed">
                    {parseInlineMarkdown(trimmed)}
                </p>
            )
        }

        return elements
    }, [content])

    return <div className="prose prose-slate dark:prose-invert max-w-none">{rendered}</div>
}

function parseInlineMarkdown(text: string): (string | React.JSX.Element)[] {
    const parts: (string | React.JSX.Element)[] = []
    let key = 0
    let currentIndex = 0

    // Match bold (**text** or __text__)
    const boldRegex = /\*\*(.+?)\*\*|__(.+?)__/g
    // Match italic (*text* or _text_)
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g

    // First handle bold (which takes precedence)
    let lastIndex = 0
    let match: RegExpExecArray | null

    // Process bold first
    const boldMatches: Array<{ start: number; end: number; text: string }> = []
    while ((match = boldRegex.exec(text)) !== null) {
        boldMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[1] || match[2],
        })
    }

    // Process italic (avoiding overlaps with bold)
    const italicMatches: Array<{ start: number; end: number; text: string }> = []
    const italicRegex2 = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g
    while ((match = italicRegex2.exec(text)) !== null) {
        // Check if this italic is inside a bold match
        const currentMatch = match
        const isInsideBold = boldMatches.some(
            (bm) => currentMatch.index >= bm.start && currentMatch.index + currentMatch[0].length <= bm.end,
        )
        if (!isInsideBold) {
            italicMatches.push({
                start: currentMatch.index,
                end: currentMatch.index + currentMatch[0].length,
                text: currentMatch[1] || currentMatch[2],
            })
        }
    }

    // Combine and sort all matches
    const allMatches = [
        ...boldMatches.map((m) => ({ ...m, type: 'bold' as const })),
        ...italicMatches.map((m) => ({ ...m, type: 'italic' as const })),
    ].sort((a, b) => a.start - b.start)

    // Build the result
    let pos = 0
    for (const match of allMatches) {
        // Add text before match
        if (match.start > pos) {
            parts.push(text.slice(pos, match.start))
        }

        // Add the formatted text
        if (match.type === 'bold') {
            parts.push(
                <strong key={key++} className="font-semibold">
                    {match.text}
                </strong>,
            )
        } else {
            parts.push(
                <em key={key++} className="italic">
                    {match.text}
                </em>,
            )
        }

        pos = match.end
    }

    // Add remaining text
    if (pos < text.length) {
        parts.push(text.slice(pos))
    }

    return parts.length > 0 ? parts : [text]
}

