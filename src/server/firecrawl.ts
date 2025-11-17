import Firecrawl from '@mendable/firecrawl-js'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

export interface ResearchResult {
  summary: string
  sources: Array<{
    url: string
    title?: string
  }>
  rawResponse?: unknown // Full Firecrawl response for dev debugging
}

/**
 * Performs a basic web search and scrape using Firecrawl to research a topic.
 * For basic use cases, this searches for general information about the topic.
 */
export async function researchTopic(query: string): Promise<ResearchResult> {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not configured')
  }

  try {
    // Initialize Firecrawl SDK
    const app = new Firecrawl({ apiKey: FIRECRAWL_API_KEY })

    // Use SDK to search and scrape in one call
    const searchResult = await app.search(query, {
      limit: 3, // Get top 3 results
      scrapeOptions: {
        formats: ['markdown'], // Get markdown content directly in search results
      },
    })

    // SDK returns SearchData with web/news/images arrays
    // When scrapeOptions are provided, web items are Document objects with markdown
    const webResults = searchResult.web || []

    if (webResults.length === 0) {
      return {
        summary: `No search results found for "${query}".`,
        sources: [],
      }
    }

    // Results already include markdown content from scrapeOptions
    // When scrapeOptions are provided, web items are Document objects with markdown
    // Type guard: check if it's a Document (has markdown property)
    const resultsWithContent = webResults.filter((r) => {
      // Document objects have markdown when scrapeOptions are provided
      return 'markdown' in r && typeof r.markdown === 'string' && r.markdown.trim().length > 0
    }) as Array<{ 
      url?: string
      title?: string
      markdown?: string
      metadata?: { sourceURL?: string; title?: string }
    }>

    if (resultsWithContent.length === 0) {
      return {
        summary: `Found search results for "${query}" but could not retrieve content.`,
        sources: webResults.map((r) => {
          // Check if it's a Document (has metadata) or SearchResultWeb
          if ('metadata' in r && r.metadata) {
            return {
              url: r.metadata.sourceURL || '',
              title: r.metadata.title,
            }
          }
          // It's a SearchResultWeb
          return {
            url: 'url' in r ? (r.url || '') : '',
            title: 'title' in r ? r.title : undefined,
          }
        }),
      }
    }

    // Generate a summary from the first result's markdown
    const firstResult = resultsWithContent[0]
    const summary = (firstResult.markdown ?? '')
      .split('\n')
      .slice(0, 10)
      .join('\n')
      .trim()
      .substring(0, 500) // Limit to 500 chars

    const result: ResearchResult = {
      summary:
        summary ||
        `Found information about "${query}" from ${resultsWithContent.length} source(s).`,
      sources: resultsWithContent.map((r) => {
        // Document objects have metadata.sourceURL, SearchResultWeb has url directly
        const url = r.metadata?.sourceURL || r.url || ''
        const title = r.metadata?.title || r.title
        return { url, title }
      }),
    }

    // Include full response in dev mode for debugging
    if (import.meta.env.DEV) {
      result.rawResponse = searchResult
    }

    return result
  } catch (error) {
    console.error('Firecrawl research error:', error)
    throw error
  }
}

