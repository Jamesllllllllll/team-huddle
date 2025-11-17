import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { SUPPORTING_SECTIONS } from './constants'
import type { PlanningItemType } from '~/types'
import type { ReactNode } from 'react'

type SupportingSectionsProps = {
    groupedItems: Record<PlanningItemType, any[]>
    renderItemList: (items: any[], type: PlanningItemType) => ReactNode
}

export function SupportingSections({ groupedItems, renderItemList }: SupportingSectionsProps) {
    const visibleSupportingSections = SUPPORTING_SECTIONS.filter((section) => {
        const items = groupedItems[section.type]
        return Array.isArray(items) && items.length > 0
    })

    if (visibleSupportingSections.length === 0) {
        return (
            <section className="space-y-2">
                <p className="text-sm text-muted-foreground">
                    Supporting context (risks, dependencies, decisions, and ownership) will appear as they are created.
                </p>
            </section>
        )
    }

    return (
        <section className="space-y-5">
            <header>
                <h2 className="text-xl font-semibold">Supporting context</h2>
                <p className="text-sm">
                    Track risks, dependencies, decisions, and ownership as they emerge.
                </p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                {visibleSupportingSections.map((section) => {
                    const items = groupedItems[section.type]
                    return (
                        <Card key={section.type} className="">
                            <CardHeader>
                                <CardTitle>{section.title}</CardTitle>
                            </CardHeader>
                            <CardContent>{renderItemList(items, section.type)}</CardContent>
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}

