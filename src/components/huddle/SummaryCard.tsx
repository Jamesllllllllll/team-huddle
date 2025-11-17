import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Loader2 } from 'lucide-react'
import type { PlanningItemType } from '~/types'
import type { ReactNode } from 'react'

type SummaryCardProps = {
    items: any[]
    renderItemList: (items: any[], type: PlanningItemType) => ReactNode
    isLoading?: boolean
}

export function SummaryCard({ items, renderItemList, isLoading = false }: SummaryCardProps) {
    return (
        <Card className="my-4 gap-0 pb-0 max-w-2xl">
            <CardHeader>
                <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Generating summary...</span>
                    </div>
                ) : (
                    renderItemList(items, 'summary')
                )}
            </CardContent>
        </Card>
    )
}

