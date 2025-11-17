import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Loader } from '../Loader'
import { ExternalLink } from 'lucide-react'

type ResearchProps = {
  planningItemId: Id<'planningItems'>
}

export function Research({ planningItemId }: ResearchProps) {
  const researchResult = useQuery(
    convexQuery(api.huddle.getResearchResult, { planningItemId })
  )

  if (researchResult.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Loader />
        </CardContent>
      </Card>
    )
  }

  if (researchResult.isError) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Error loading research results.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!researchResult.data) {
    return null
  }

  const { summary, sources, status, error } = researchResult.data

  if (status === 'pending') {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Research in progress...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (status === 'failed') {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-destructive">
            Research failed: {error ?? 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Research Findings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Summary</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {summary}
            </p>
          </div>
        )}
        {sources && sources.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Sources</h4>
            <ul className="space-y-2">
              {sources.map((source: { url: string; title?: string }, index: number) => (
                <li key={index} className="text-sm">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {source.title || source.url}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

