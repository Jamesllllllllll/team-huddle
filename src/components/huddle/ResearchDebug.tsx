import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

type PlanningItem = {
    id: string
    text: string
    type: string
    metadata?: {
        needsResearch?: boolean
        [key: string]: unknown
    } | null
}

type ResearchDebugProps = {
    planningItems: PlanningItem[]
    huddleId: Id<'huddles'>
}

export function ResearchDebug({ planningItems, huddleId }: ResearchDebugProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
    
    // Get all ideas with needsResearch flag
    const ideasNeedingResearch = planningItems.filter(
        (item) => item.type === 'idea' && item.metadata?.needsResearch === true
    )
    
    const toggleExpanded = (itemId: string) => {
        setExpandedItems((prev) => {
            const next = new Set(prev)
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return next
        })
    }

    // Fetch all research results for the huddle in a single query
    const allResearchResults = useQuery(
        convexQuery(api.huddle.getAllResearchResults, { huddleId })
    )

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Research Debug (Dev Only)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
                <div>
                    <div className="font-semibold mb-2">
                        Ideas with needsResearch flag: {ideasNeedingResearch.length}
                    </div>
                    {ideasNeedingResearch.length === 0 ? (
                        <p className="text-muted-foreground italic">
                            No ideas marked for research
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {ideasNeedingResearch.map((item) => {
                                const researchResult = allResearchResults.data?.[item.id]
                                return (
                                    <li
                                        key={item.id}
                                        className="border rounded p-2 space-y-1"
                                    >
                                        <div className="font-medium">{item.text}</div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                needsResearch: true
                                            </Badge>
                                            {researchResult ? (
                                                <Badge
                                                    variant={
                                                        researchResult.status === 'completed'
                                                            ? 'default'
                                                            : researchResult.status === 'failed'
                                                              ? 'destructive'
                                                              : 'secondary'
                                                    }
                                                    className="text-xs"
                                                >
                                                    {researchResult.status}
                                                </Badge>
                                            ) : allResearchResults.isLoading ? (
                                                <Badge variant="secondary" className="text-xs">
                                                    Loading...
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs">
                                                    No result
                                                </Badge>
                                            )}
                                        </div>
                                        {researchResult && (
                                            <div className="mt-2 space-y-2 text-xs">
                                                <div className="text-muted-foreground">
                                                    <div>
                                                        <span className="font-medium">Query:</span>{' '}
                                                        {researchResult.query}
                                                    </div>
                                                </div>
                                                {researchResult.status === 'completed' && (
                                                    <>
                                                        <div>
                                                            <span className="font-medium">Summary:</span>
                                                            <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                                                                {researchResult.summary}
                                                            </p>
                                                        </div>
                                                        {researchResult.sources &&
                                                            researchResult.sources.length > 0 && (
                                                                <div>
                                                                    <span className="font-medium">Sources:</span>
                                                                    <ul className="mt-1 space-y-1">
                                                                        {researchResult.sources.map(
                                                                            (source, idx) => (
                                                                                <li key={idx}>
                                                                                    <a
                                                                                        href={source.url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                                                                    >
                                                                                        {source.title ||
                                                                                            source.url}
                                                                                        <ExternalLink className="size-3" />
                                                                                    </a>
                                                                                </li>
                                                                            )
                                                                        )}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        {researchResult.rawResponse && (
                                                            <div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpanded(item.id)}
                                                                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                                                                >
                                                                    {expandedItems.has(item.id) ? (
                                                                        <>
                                                                            <ChevronUp className="size-3" />
                                                                            Hide Full Firecrawl Response
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <ChevronDown className="size-3" />
                                                                            View Full Firecrawl Response
                                                                        </>
                                                                    )}
                                                                </button>
                                                                {expandedItems.has(item.id) && (
                                                                    <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-auto max-h-96">
                                                                        {JSON.stringify(
                                                                            researchResult.rawResponse,
                                                                            null,
                                                                            2
                                                                        )}
                                                                    </pre>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {researchResult.status === 'failed' && (
                                                    <div className="text-destructive">
                                                        <span className="font-medium">Error:</span>{' '}
                                                        {researchResult.error}
                                                    </div>
                                                )}
                                                {researchResult.status === 'pending' && (
                                                    <div className="text-muted-foreground">
                                                        Research in progress...
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
                <div>
                    <div className="font-semibold mb-2">All Ideas Metadata:</div>
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {planningItems
                            .filter((item) => item.type === 'idea')
                            .map((item) => (
                                <li key={item.id} className="text-xs">
                                    <span className="font-medium">
                                        {item.text.slice(0, 30)}...
                                    </span>
                                    <span className="text-muted-foreground ml-2">
                                        needsResearch:{' '}
                                        {String(
                                            item.metadata?.needsResearch ?? 'undefined'
                                        )}
                                    </span>
                                </li>
                            ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}

